/**
 * Create or reset user for login.
 * Usage: node scripts/create-user.js [password]
 * Default password: password123
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/design_export';
const EMAIL = 'sinh.ha@gmail.com';
const NAME = 'Sinh Ha';
const PASSWORD = process.argv[2] || 'password123';

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  name: String,
  createdAt: Date,
  updatedAt: Date,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function createUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    let user = await User.findOne({ email: EMAIL.toLowerCase() });
    if (user) {
      user.password = PASSWORD;
      user.name = NAME;
      await user.save();
      console.log('Password UPDATED for', EMAIL);
    } else {
      await User.create({
        email: EMAIL.toLowerCase(),
        password: PASSWORD,
        name: NAME,
      });
      console.log('Account CREATED for', EMAIL);
    }
    console.log('You can now log in with:');
    console.log('  Email:', EMAIL);
    console.log('  Password:', PASSWORD);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

createUser();
