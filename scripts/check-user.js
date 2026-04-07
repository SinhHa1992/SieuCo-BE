const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/design_export';

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  name: String,
  createdAt: Date,
  updatedAt: Date,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function checkUser() {
  try {
    await mongoose.connect(MONGODB_URI);
    const user = await User.findOne({ email: 'sinh.ha@gmail.com' });
    if (user) {
      console.log('Account FOUND for sinh.ha@gmail.com');
      console.log('  Name:', user.name);
      console.log('  Created:', user.createdAt);
      console.log('  Updated:', user.updatedAt);
    } else {
      console.log('Account NOT FOUND for sinh.ha@gmail.com');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkUser();
