const bcrypt   = require('bcryptjs');
const readline = require('readline');
const { openDb } = require('./_db');

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
    const { client, db } = await openDb(); // non destructif : insertion seule
    try {
        console.log('\n🔐 Création du compte patron\n');

        const email    = await ask('Email patron    : ');
        const password = await ask('Mot de passe    : ');
        const name     = await ask('Prénom / Nom    : ');

        if (password.length < 8) {
            console.error('❌ Minimum 8 caractères');
            process.exit(1);
        }

        const existing = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            console.error(`❌ Compte existant pour ${email}`);
            process.exit(1);
        }

        const hash = await bcrypt.hash(password, 12);
        await db.collection('users').insertOne({
            email:         email.toLowerCase().trim(),
            password_hash: hash,
            role:          'patron',
            staff_id:      null,
            name:          name.trim(),
            created_at:    new Date(),
        });

        console.log(`\n✅ Compte patron créé : ${email.toLowerCase().trim()}`);
        console.log('   Lance npm run dev puis va sur http://localhost:3000\n');
    } catch (e) {
        console.error('❌', e.message);
    } finally {
        rl.close();
        await client.close();
    }
}

main();