import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../src/models/User.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/design_export';

async function setPassword() {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      'Usage: npx tsx scripts/set-password.ts <email> <password>\n' +
        'Or set ADMIN_EMAIL and ADMIN_PASSWORD in the environment.',
    );
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);

  let user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    user.password = password;
    await user.save();
    console.log(`Password updated for ${email}`);
  } else {
    user = await User.create({
      email: email.toLowerCase(),
      password,
      name: 'Sinh Ha',
    });
    console.log(`User created for ${email} with password set`);
  }

  await mongoose.disconnect();
}

setPassword().catch((err) => {
  console.error(err);
  process.exit(1);
});
