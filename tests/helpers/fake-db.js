'use strict';
// Mini base Mongo en mémoire pour les tests d'intégration de routes (CD-05).
// Implémente UNIQUEMENT ce que les routes testées utilisent : findOne, find().toArray(),
// insertOne, insertMany, deleteMany, updateOne (avec upsert/$set/$pull), bulkWrite
// (updateOne+upsert), countDocuments — et les opérateurs $ne/$lte/$gte/$lt/$gt/$in.
// Le 2e argument de find() (projection) est ignoré. Pas un clone fidèle de
// Mongo : juste assez pour piloter la logique métier sans serveur réel.

function isObjId(x) {
    return x && typeof x === 'object' && typeof x.toHexString === 'function';
}

// Égalité tolérante : ObjectId vs hex string, Date vs Date, sinon strict.
function eq(a, b) {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (isObjId(a) || isObjId(b)) return String(a) === String(b);
    return a === b;
}

function isOperator(cond) {
    return cond !== null && typeof cond === 'object' && !Array.isArray(cond)
        && !(cond instanceof Date) && !isObjId(cond)
        && Object.keys(cond).every(k => k.startsWith('$'));
}

// Mongo : quand le CHAMP est un tableau, une égalité (et `$in`) matche si le tableau
// CONTIENT la valeur. C'est ce que font `{ venues: 'bar1' }` (S-04, `staffDispoOpen`) et
// `{ assigned_establishments: estab.id }` (DELETE établissement). Sans ça, ces filtres
// ne renvoient jamais rien ici et les tests passeraient à côté.
const contains = (val, v) => Array.isArray(val) ? val.some(x => eq(x, v)) : eq(val, v);

// `$ne`/`$nin` gardent volontairement la sémantique SCALAIRE : leur seul usage
// (`type: { $ne: 'week_note' }`) porte sur un champ scalaire, et la vraie sémantique
// Mongo sur tableau (« ne contient pas ») changerait le résultat de filtres existants.
function matchField(val, cond) {
    if (isOperator(cond)) {
        return Object.entries(cond).every(([op, v]) => {
            switch (op) {
                case '$ne':  return !eq(val, v);
                case '$lte': return val <= v;
                case '$gte': return val >= v;
                case '$lt':  return val < v;
                case '$gt':  return val > v;
                case '$in':  return Array.isArray(v) && v.some(y => contains(val, y));
                case '$nin': return Array.isArray(v) && !v.some(x => eq(val, x));
                case '$exists': return (val !== undefined) === !!v;
                default:     throw new Error('fake-db: opérateur non supporté ' + op);
            }
        });
    }
    return contains(val, cond);
}

// Opérateurs LOGIQUES (`$and`/`$or`/`$nor`) : ils prennent des sous-requêtes complètes,
// pas une valeur de champ — d'où le traitement à part. Sans eux, une requête comme celle du
// récap mensuel (`$and: [{ $or: [...] }, ...]`) ne matchait AUCUN document, et un test
// écrit dessus passait pour de mauvaises raisons.
function matchDoc(doc, query) {
    return Object.entries(query || {}).every(([k, cond]) => {
        if (k === '$and') return (cond || []).every(sub => matchDoc(doc, sub));
        if (k === '$or')  return (cond || []).some(sub => matchDoc(doc, sub));
        return matchField(doc[k], cond);
    });
}

// Champs d'égalité simple d'un filtre (sert à construire un doc upserté).
function plainEq(query) {
    const out = {};
    for (const [k, v] of Object.entries(query || {})) if (!isOperator(v)) out[k] = v;
    return out;
}

// _id auto-généré, format ObjectId (24 hex) pour passer `isValidObjectId`.
let _idSeq = 0;
function nextObjectIdHex() {
    return 'fa9e0000' + String(++_idSeq).padStart(16, '0');
}

function makeCollection(initialDocs) {
    const docs = (initialDocs || []).map(d => ({ ...d }));
    return {
        _docs: docs,
        async findOne(query)      { return docs.find(d => matchDoc(d, query)) || null; },
        find(query)               {
            const res = docs.filter(d => matchDoc(d, query));
            return { sort() { return this; }, limit() { return this; }, async toArray() { return res.slice(); } };
        },
        // Mongo attribue toujours un _id : le simuler est nécessaire dès qu'une route
        // réutilise l'`insertedId` (ex. createManagerStaffProfile, dont le retour
        // devient le `staff_id` du user).
        async insertOne(doc)      {
            const stored = { ...doc, _id: doc._id || nextObjectIdHex() };
            docs.push(stored);
            return { insertedId: stored._id, acknowledged: true };
        },
        async insertMany(arr)     {
            (arr || []).forEach(d => docs.push({ ...d, _id: d._id || nextObjectIdHex() }));
            return { insertedCount: (arr || []).length, acknowledged: true };
        },
        async countDocuments(q)   { return docs.filter(d => matchDoc(d, q || {})).length; },
        // Valeurs distinctes d'un champ. Mongo aplatit les tableaux (un champ `groups: ['a','b']`
        // contribue 'a' ET 'b') et ignore les documents où le champ est absent.
        async distinct(field, q)  {
            const out = new Set();
            for (const d of docs.filter(x => matchDoc(x, q || {}))) {
                const v = d[field];
                if (v === undefined || v === null) continue;
                (Array.isArray(v) ? v : [v]).forEach(x => out.add(x));
            }
            return [...out];
        },
        // Son absence rendait INTESTABLE toute route l'utilisant — dont la propagation
        // d'un renommage staff et le déliement des comptes à la suppression d'un profil.
        async updateMany(query, update) {
            let n = 0;
            for (const doc of docs) {
                if (!matchDoc(doc, query)) continue;
                if (update.$set)  Object.assign(doc, update.$set);
                if (update.$pull) for (const [k, v] of Object.entries(update.$pull))
                    if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !eq(x, v));
                n++;
            }
            return { matchedCount: n, modifiedCount: n };
        },
        async deleteOne(query)    {
            const i = docs.findIndex(d => matchDoc(d, query));
            if (i < 0) return { deletedCount: 0 };
            docs.splice(i, 1);
            return { deletedCount: 1 };
        },
        async deleteMany(query)   {
            let n = 0;
            for (let i = docs.length - 1; i >= 0; i--) if (matchDoc(docs[i], query)) { docs.splice(i, 1); n++; }
            return { deletedCount: n };
        },
        async updateOne(query, update, opts) {
            const idx = docs.findIndex(d => matchDoc(d, query));
            if (idx >= 0) {
                if (update.$set)  Object.assign(docs[idx], update.$set);
                if (update.$pull) for (const [k, v] of Object.entries(update.$pull))
                    if (Array.isArray(docs[idx][k])) docs[idx][k] = docs[idx][k].filter(x => !eq(x, v));
                return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
            }
            if (opts && opts.upsert) {
                docs.push({ ...plainEq(query), ...(update.$setOnInsert || {}), ...(update.$set || {}) });
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        },
        async bulkWrite(ops) {
            let upsertedCount = 0, modifiedCount = 0, matchedCount = 0;
            for (const op of ops) {
                const { filter, update, upsert } = op.updateOne;
                const idx = docs.findIndex(d => matchDoc(d, filter));
                if (idx >= 0) {
                    matchedCount++;
                    if (update.$set) { Object.assign(docs[idx], update.$set); modifiedCount++; }
                } else if (upsert) {
                    docs.push({ ...plainEq(filter), ...(update.$setOnInsert || {}), ...(update.$set || {}) });
                    upsertedCount++;
                }
            }
            return { upsertedCount, modifiedCount, matchedCount };
        },
    };
}

// makeDb({ collectionName: [docs...] }) → objet { collection(name) }.
function makeDb(seed) {
    const cols = {};
    for (const [name, arr] of Object.entries(seed || {})) cols[name] = makeCollection(arr);
    return {
        collection(name) { return (cols[name] = cols[name] || makeCollection([])); },
    };
}

module.exports = { makeDb };
