'use strict';
// Mini base Mongo en mémoire pour les tests d'intégration de routes (CD-05).
// Implémente UNIQUEMENT ce que les routes testées utilisent : findOne, find().toArray(),
// insertOne, insertMany, deleteMany, updateOne (avec upsert/$set/$pull), bulkWrite
// (updateOne+upsert), countDocuments — et les opérateurs $ne/$lte/$gte/$lt/$gt/$in
// /$nin/$exists/$regex (+$options).
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

// 8e lacune (2026-08-13) : `$addToSet` n'était pas implémenté DU TOUT, alors que deux
// routes de production s'en servent (`PATCH /api/dispo-settings/force-open-staff` et
// `POST /api/dispos/reopen-for-correction`). Elles étaient donc intestables — et c'est
// justement pour ça que personne n'avait vu que la réouverture ne portait pas de semaine.
// Mongo compare les éléments par égalité de document ENTIER, pas par référence.
function sameValue(a, b) {
    if (eq(a, b)) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object'
        && !(a instanceof Date) && !(b instanceof Date)) {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length === kb.length && ka.every(k => sameValue(a[k], b[k]));
    }
    return false;
}

function addToSet(doc, k, v) {
    if (!Array.isArray(doc[k])) doc[k] = [];
    if (!doc[k].some(x => sameValue(x, v))) doc[k].push(v);
}

// `$pull` a deux formes en Mongo : une VALEUR (retire les éléments égaux) ou un CRITÈRE
// (retire les éléments qui le satisfont, par comparaison PARTIELLE). La seconde devient
// nécessaire dès que `force_open_staff` porte des objets : retirer « la réouverture de
// Kevin pour CETTE semaine-là » sans emporter les autres.
// Un élément scalaire (entrée legacy) ne satisfait jamais un critère objet — c'est aussi
// le comportement de Mongo, et c'est celui qu'on veut : les entrées d'avant ne sont
// retirées que par un `$pull` scalaire.
function pullHits(x, v) {
    const isCriteria = v && typeof v === 'object' && !Array.isArray(v)
        && !(v instanceof Date) && !isObjId(v);
    return isCriteria ? matchDoc(x, v) : eq(x, v);
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
                // `fetchPublishedWeeks` interroge les settings par préfixe (`^publish_`).
                // Sans cet opérateur, toute route qui vérifie « cette semaine est-elle
                // publiée ? » lançait ici — l'erreur était avalée par le `catch` de la
                // notification asynchrone, donc invisible sauf à lire la sortie du runner.
                case '$regex': return typeof val === 'string' && new RegExp(v, cond.$options || '').test(val);
                // 6e lacune trouvée (F-14) : `$options` n'est pas un opérateur, c'est le
                // modificateur de `$regex` — mais il arrive comme une clé frère dans le même
                // objet. Sans ce cas, toute recherche insensible à la casse lançait ici, et
                // `POST /api/shifts/extra` (résolution PAR NOM) restait intestable : la route
                // rendait un 500 opaque au lieu de son vrai résultat.
                case '$options': return true; // consommé par `$regex` ci-dessus
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
// Mongo accepte les chemins pointés (`'session.user._id'`) — c'est ainsi qu'on retrouve
// les sessions d'un utilisateur dans le store. Sans ça, ces filtres ne matchent rien ici.
const getPath = (doc, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), doc);

function matchDoc(doc, query) {
    return Object.entries(query || {}).every(([k, cond]) => {
        if (k === '$and') return (cond || []).every(sub => matchDoc(doc, sub));
        if (k === '$or')  return (cond || []).some(sub => matchDoc(doc, sub));
        return matchField(k.includes('.') ? getPath(doc, k) : doc[k], cond);
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
        // Accesseur, et non `_docs: docs`. Toutes les méthodes ci-dessous capturent le
        // tableau `docs` par fermeture : une affectation `col._docs = [...]` remplaçait
        // silencieusement la PROPRIÉTÉ sans toucher au tableau réellement lu, si bien
        // qu'un test qui préparait un état par ce chemin testait… l'état d'avant. Piège
        // rencontré le 2026-08-10 (une mutation censée casser un test ne l'a pas cassé).
        // Le setter écrit donc EN PLACE. La lecture est inchangée.
        get _docs() { return docs; },
        set _docs(next) { docs.length = 0; docs.push(...(next || [])); },
        // 7e lacune comblée (2026-08-13) : ces deux méthodes rendaient les objets STOCKÉS,
        // pas des copies. Un vrai driver Mongo désérialise le BSON à chaque lecture, donc
        // le document rendu est toujours une copie détachée. La différence est invisible
        // tant qu'on ne fait que lire ; elle ment dès qu'une route relit un état AVANT de
        // le réécrire (B2 : lire la dispo avant l'upsert pour savoir si elle a changé) —
        // l'écriture mutait l'instantané en place, et le test échouait sur du code correct.
        // Copie SUPERFICIELLE : suffisante ici, les documents de ce projet sont plats
        // (les tableaux comme `venues` restent partagés, à garder en tête).
        async findOne(query)      {
            const found = docs.find(d => matchDoc(d, query));
            return found ? { ...found } : null;
        },
        find(query)               {
            let res = docs.filter(d => matchDoc(d, query)).map(d => ({ ...d }));
            return {
                // 10e lacune (2026-08-13) : `sort` était un no-op. Les routes qui trient
                // rendaient donc l'ordre d'INSERTION, et tout test sur l'ordre passait ou
                // échouait par accident. F-12 lit un journal — un litige se lit dans
                // l'ordre où les choses se sont passées, donc l'ordre EST le comportement.
                // Champ absent = trié en dernier (Mongo le met en premier en ascendant ;
                // l'écart est assumé, aucun tri du projet ne porte sur un champ optionnel).
                sort(spec) {
                    const keys = Object.entries(spec || {});
                    if (keys.length) res.sort((a, b) => {
                        for (const [k, dir] of keys) {
                            const av = a[k], bv = b[k];
                            if (av === bv) continue;
                            if (av === undefined || av === null) return 1;
                            if (bv === undefined || bv === null) return -1;
                            return (av < bv ? -1 : 1) * (dir < 0 ? -1 : 1);
                        }
                        return 0;
                    });
                    return this;
                },
                limit(n) { if (typeof n === 'number' && n >= 0) res = res.slice(0, n); return this; },
                async toArray() { return res.slice(); },
            };
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
                if (update.$addToSet) for (const [k, v] of Object.entries(update.$addToSet))
                    addToSet(doc, k, v);
                if (update.$pull) for (const [k, v] of Object.entries(update.$pull))
                    if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !pullHits(x, v));
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
                // `$unset` RETIRE le champ ; le passer à `false` ou `undefined` ne serait pas
                // la même chose : `{ archived: { $ne: true } }` matche un champ absent, et un
                // test de désarchivage (F-13) passerait alors que le drapeau serait resté.
                if (update.$unset) for (const k of Object.keys(update.$unset)) delete docs[idx][k];
                if (update.$addToSet) for (const [k, v] of Object.entries(update.$addToSet))
                    addToSet(docs[idx], k, v);
                if (update.$pull) for (const [k, v] of Object.entries(update.$pull))
                    if (Array.isArray(docs[idx][k])) docs[idx][k] = docs[idx][k].filter(x => !pullHits(x, v));
                return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
            }
            if (opts && opts.upsert) {
                const created = { ...plainEq(query), ...(update.$setOnInsert || {}), ...(update.$set || {}) };
                // `$addToSet` en upsert crée bien le tableau côté Mongo. Sans ce cas, la
                // toute première réouverture (doc `settings` absent) se perdait en silence.
                if (update.$addToSet) for (const [k, v] of Object.entries(update.$addToSet))
                    addToSet(created, k, v);
                docs.push(created);
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
                    // 9e lacune (2026-08-13) : l'upsert de `bulkWrite` ne posait pas d'`_id`,
                    // alors qu'`insertOne` le fait depuis une session précédente pour
                    // exactement la même raison. Conséquence : une dispo créée par
                    // `POST /api/dispos` (qui passe par bulkWrite) n'avait pas d'identifiant,
                    // donc AUCUNE des routes qui la prennent par `_id` — confirm, reject,
                    // ignore — n'était testable sur un document réellement créé par la route.
                    docs.push({ ...plainEq(filter), ...(update.$setOnInsert || {}),
                        ...(update.$set || {}), _id: nextObjectIdHex() });
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
