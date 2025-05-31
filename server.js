// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── 1. CORS & BODY PARSER SETUP ────────────────────────────────────────────────
// Allow requests from your Netlify front–end (and localhost for local testing).
app.use(
  cors({
    origin: [
      'https://earnest-melomakarona-7cf1bf.netlify.app', // your Netlify domain
      'http://localhost:8000',                            // your local dev URL
    ],
  })
);

// Increase the JSON payload limit so base64 images won’t be too large.
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ─── 2. MONGODB / MONGOOSE SETUP ────────────────────────────────────────────────
// Make sure you’ve set this in Render’s “Environment” → MONGODB_URI.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI environment variable is missing.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('📦 MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// ─── 3. DEFINE THE CANDIDATE SCHEMA ─────────────────────────────────────────────
const candidateSchema = new mongoose.Schema({
  uniqueToken:        { type: String, required: true, unique: true },
  clientName:         { type: String, required: true },
  subClientName:      { type: String, required: true },
  candidateName:      { type: String, required: true },
  employeeId:         { type: String, required: true },
  phoneNumber:        { type: String, required: true },
  alternatePhone:     { type: String, required: true },
  address:            { type: String, required: true },
  pincode:            { type: String, required: true },
  areaName:           { type: String, required: true },
  city:               { type: String, required: true },
  state:              { type: String, required: true },
  posStartDate:       { type: String, required: true },
  posEndDate:         { type: String, required: true },
  residentType:       { type: String, required: true },
  relationshipWithRespondent: { type: String, required: true },
  typeOfID:           { type: String, required: true },
  photo1:             { type: String },
  meta1:              { type: String },
  photo2:             { type: String },
  meta2:              { type: String },
  photo3:             { type: String },
  meta3:              { type: String },
  photo4:             { type: String },
  meta4:              { type: String },
  photo5:             { type: String },
  meta5:              { type: String },
  photo6:             { type: String },
  meta6:              { type: String },
  status:             { type: String, enum: ['Pending', 'Submitted'], default: 'Pending' },
  submittedAt:        { type: Date },
});
const Candidate = mongoose.model('Candidate', candidateSchema);

// ─── 4. MULTER SETUP (for Excel upload) ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Only accept .xlsx or .xls files
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only .xlsx or .xls files are allowed'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max for the Excel file
  },
});

// ─── 5. HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  return res.json({ status: 'OK' });
});

// ─── 6. ADMIN: UPLOAD & PARSE EXCEL ─────────────────────────────────────────────
app.post('/admin/upload-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read workbook from the uploaded buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    // Expected column headers (must match exactly, including spaces/case):
    const requiredHeaders = [
      'Client Name',
      'Sub Client Name',
      'Candidate Name',
      'Employee Id',
      'phone number',
      'Alternate phone number',
      'address',
      'pincode',
      'Area Name',
      'City',
      'State',
      'POS start date',
      'POS end Date',
      'Resident Type',
      'Relationship With Respondent',
      'Type of ID',
    ];

    // Check the first row’s keys for missing headers
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }
    const firstRowKeys = Object.keys(rows[0]);
    for (let header of requiredHeaders) {
      if (!firstRowKeys.includes(header)) {
        return res.status(400).json({ error: `Missing required header: "${header}"` });
      }
    }

    const results = [];

    for (let row of rows) {
      // Generate a unique token
      const uniqueToken = uuidv4();

      // Create and save the new candidate
      const candidate = new Candidate({
        uniqueToken: uniqueToken,
        clientName: row['Client Name'].toString(),
        subClientName: row['Sub Client Name'].toString(),
        candidateName: row['Candidate Name'].toString(),
        employeeId: row['Employee Id'].toString(),
        phoneNumber: row['phone number'].toString(),
        alternatePhone: row['Alternate phone number'].toString(),
        address: row['address'].toString(),
        pincode: row['pincode'].toString(),
        areaName: row['Area Name'].toString(),
        city: row['City'].toString(),
        state: row['State'].toString(),
        posStartDate: row['POS start date'].toString(),
        posEndDate: row['POS end Date'].toString(),
        residentType: row['Resident Type'].toString(),
        relationshipWithRespondent: row['Relationship With Respondent'].toString(),
        typeOfID: row['Type of ID'].toString(),
        status: 'Pending',
      });

      await candidate.save();

      // Build the unique link (pointing to your Netlify front end)
      const uniqueLink = `https://earnest-melomakarona-7cf1bf.netlify.app/candidate-verify.html?token=${uniqueToken}`;

      results.push({
        candidateName: candidate.candidateName,
        phoneNumber: candidate.phoneNumber,
        uniqueLink: uniqueLink,
      });
    }

    return res.json({ message: 'Upload successful', candidates: results });
  } catch (err) {
    console.error('Error in /admin/upload-excel:', err);
    // If multer threw an error (e.g. wrong file type), send its message:
    if (err.message && err.message.startsWith('Only .xlsx')) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && err.message.includes('Unexpected')) {
      return res.status(400).json({ error: 'Failed to parse Excel. Please ensure the file is a valid .xlsx.' });
    }
    return res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

// ─── 7. GET CANDIDATE BY TOKEN (for prefill) ────────────────────────────────────
app.get('/candidate/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    return res.json(candidate);
  } catch (err) {
    console.error('Error in GET /candidate/:token:', err);
    return res.status(500).json({ error: 'Server error fetching candidate' });
  }
});

// ─── 8. SUBMIT CANDIDATE FORM (with photos) ─────────────────────────────────────
app.post('/submit/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    if (candidate.status === 'Submitted') {
      return res.status(400).json({ error: 'Form already submitted' });
    }

    // Update all fields (prefilled + dropdown + photos)
    candidate.clientName = req.body.clientName;
    candidate.subClientName = req.body.subClientName;
    candidate.candidateName = req.body.candidateName;
    candidate.employeeId = req.body.employeeId;
    candidate.phoneNumber = req.body.phoneNumber;
    candidate.alternatePhone = req.body.alternatePhone;
    candidate.address = req.body.address;
    candidate.pincode = req.body.pincode;
    candidate.areaName = req.body.areaName;
    candidate.city = req.body.city;
    candidate.state = req.body.state;
    candidate.posStartDate = req.body.posStartDate;
    candidate.posEndDate = req.body.posEndDate;
    candidate.residentType = req.body.residentType;
    candidate.relationshipWithRespondent = req.body.relationshipWithRespondent;
    candidate.typeOfID = req.body.typeOfID;

    // Attach the six photos + metadata
    for (let i = 1; i <= 6; i++) {
      candidate['photo' + i] = req.body['photo' + i];
      candidate['meta' + i] = req.body['meta' + i];
    }

    candidate.status = 'Submitted';
    candidate.submittedAt = new Date();
    await candidate.save();

    return res.json({ message: 'Submission saved' });
  } catch (err) {
    console.error('Error in POST /submit/:token:', err);
    return res.status(500).json({ error: 'Server error saving submission' });
  }
});

// ─── 9. START THE SERVER ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
