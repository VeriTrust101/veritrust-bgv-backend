// server.js
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const uuid = require('uuid').v4;
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (update if you want to restrict)
app.use(cors());
app.use(express.json({ limit: '20mb' })); // for JSON payloads (photos etc.)

// MongoDB Connection
mongoose.connect(
  process.env.MONGODB_URI || 'mongodb://localhost:27017/veritrust', // fallback for local test
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => {
  console.log('MongoDB connected!');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Candidate Schema
const candidateSchema = new mongoose.Schema({
  uniqueToken: String,
  clientName: String,
  subClientName: String,
  candidateName: String,
  employeeId: String,
  phoneNumber: String,
  alternatePhone: String,
  address: String,
  pincode: String,
  areaName: String,
  city: String,
  state: String,
  status: { type: String, default: 'Pending' },
  formData: Object,     // The actual form data (after submission)
  photos: Object,       // base64 + metadata for each photo (after submission)
  submitted: { type: Boolean, default: false },
  submittedAt: Date
});
const Candidate = mongoose.model('Candidate', candidateSchema);

// File upload setup
const upload = multer({ dest: 'uploads/' });

// ---- Routes ----

// Excel Upload (Admin)
app.post('/upload-excel', upload.single('excel'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Parse Excel
    const wb = xlsx.readFile(file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);

    // Create candidate records
    let candidates = [];
    for (let row of rows) {
      // Adjust column names as per your Excel
      const uniqueToken = uuid();
      const candidate = await Candidate.create({
        uniqueToken,
        clientName: row['Client Name'] || '',
        subClientName: row['Sub Client Name'] || '',
        candidateName: row['Candidate Name'] || '',
        employeeId: row['Employee Id'] || '',
        phoneNumber: row['phone number'] || '',
        alternatePhone: row['Alternate phone number'] || '',
        address: row['address'] || '',
        pincode: row['pincode'] || '',
        areaName: row['Area Name'] || '',
        city: row['City'] || '',
        state: row['State'] || ''
      });
      candidates.push({
        candidateName: candidate.candidateName,
        phoneNumber: candidate.phoneNumber,
        uniqueLink: `https://earnest-melomakarona-7cf1bf.netlify.app/candidate-verify.html?token=${uniqueToken}`
      });
    }

    res.json({ message: 'Upload successful', candidates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Get Candidate Data by Token (for pre-fill, login)
app.get('/candidate/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate)
      return res.status(404).json({ error: 'Candidate not found or invalid link.' });
    if (candidate.submitted)
      return res.status(403).json({ error: 'Form already submitted' });

    res.json({
      clientName: candidate.clientName,
      subClientName: candidate.subClientName,
      candidateName: candidate.candidateName,
      employeeId: candidate.employeeId,
      phoneNumber: candidate.phoneNumber,
      alternatePhone: candidate.alternatePhone,
      address: candidate.address,
      pincode: candidate.pincode,
      areaName: candidate.areaName,
      city: candidate.city,
      state: candidate.state
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Form Submission + Link Expiry
app.post('/submit/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate)
      return res.status(404).json({ error: 'Candidate not found or invalid link.' });
    if (candidate.submitted)
      return res.status(403).json({ error: 'Form already submitted' });

    // Save form data and photos (base64)
    candidate.formData = req.body;
    candidate.photos = {};
    for (let i = 1; i <= 6; i++) {
      if (req.body[`photo${i}`]) {
        candidate.photos[`photo${i}`] = {
          image: req.body[`photo${i}`],
          meta: req.body[`meta${i}`] || ''
        };
      }
    }
    candidate.status = 'Submitted';
    candidate.submitted = true;
    candidate.submittedAt = new Date();
    await candidate.save();

    res.json({ message: 'Form submitted successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// --- Static File Serving for Frontend (optional for local dev) ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.send('Veritrust BGV Backend is running!');
});


// Admin: Get all candidates
app.get('/admin/candidates', async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ submittedAt: -1 });
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// Admin: Get single candidate full details by ID
app.get('/admin/candidate/:id', async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) return res.status(404).json({ error: 'Not found' });
    res.json(candidate);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

// ---- Start Server ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
