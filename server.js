// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const multer = require('multer');
const path = require('path');

// ───────────────────────────────────────────────────────────────────────────────
// 1. CONFIGURATION
// ───────────────────────────────────────────────────────────────────────────────

// Replace this with your actual MongoDB Atlas connection string:
const MONGODB_URI = 'mongodb+srv://veritrust:<YourPassword>@veritrust-cluster.cjmsmak.mongodb.net/veritrust?retryWrites=true&w=majority';

const PORT = process.env.PORT || 3001;
const app = express();

// Enable CORS for your Netlify frontend domain (and localhost if testing locally):
app.use(
  cors({
    origin: [
      'https://earnest-melomakarona-7cf1bf.netlify.app', // your Netlify site
      'http://localhost:8000',                           // your local dev URL (if needed)
    ],
  })
);

// Increase the JSON body size limit to 20 MB (so large base64 images don’t get rejected)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ───────────────────────────────────────────────────────────────────────────────
// 2. MONGOOSE SCHEMA & MODEL
// ───────────────────────────────────────────────────────────────────────────────

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('📦 MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

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
  // Photos (base64) + metadata (GPS, timestamp)
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

// ───────────────────────────────────────────────────────────────────────────────
// 3. MULTER SETUP (for future file uploads, if needed) 
//    (Right now we don’t store any files locally, so this is just placeholder.)
// ───────────────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(), // we’re not saving raw files to disk here
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. ROUTES
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Health-check endpoint
 */
app.get('/health', (req, res) => {
  return res.json({ status: 'OK' });
});

/**
 * 4.1 Upload Excel and Parse Candidates
 *     (This route is used by your Admin page to upload the Excel file.
 *      It reads each row, generates a unique token, saves to MongoDB, and returns an array of { candidateName, phoneNumber, uniqueLink }.)
 */
app.post('/admin/upload-excel', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the uploaded Excel buffer
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const results = [];

    for (let row of rows) {
      // Generate a unique token for each candidate
      const uniqueToken = uuidv4();

      // Create a new Candidate document
      const candidate = new Candidate({
        uniqueToken: uniqueToken,
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
        state: row['State'] || '',
        posStartDate: row['POS start date'] || '',
        posEndDate: row['POS end Date'] || '',
        residentType: row['Resident Type'] || '',
        relationshipWithRespondent: row['Relationship With Respondent'] || '',
        typeOfID: row['Type of ID'] || '',
        status: 'Pending',
      });

      await candidate.save();

      // The unique link that gets sent to each candidate:
      const uniqueLink = `https://<YOUR_NETLIFY_DOMAIN>/candidate-verify.html?token=${uniqueToken}`;

      results.push({
        candidateName: candidate.candidateName,
        phoneNumber: candidate.phoneNumber,
        uniqueLink: uniqueLink,
      });
    }

    return res.json({ message: 'Upload successful', candidates: results });
  } catch (err) {
    console.error('Error in /admin/upload-excel:', err);
    return res.status(500).json({ error: 'Failed to process Excel file' });
  }
});

/**
 * 4.2 Get Candidate by Token (for prefill & authentication)
 */
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

/**
 * 4.3 Submit Candidate Form (with all fields + 6 photos)
 */
app.post('/submit/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Prevent double submission
    if (candidate.status === 'Submitted') {
      return res.status(400).json({ error: 'Form already submitted' });
    }

    // Update all prefilled fields (in case you allow edits, otherwise these can be omitted)
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

    // Attach all six base64-encoded photos + their GPS/timestamp metadata
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

// ───────────────────────────────────────────────────────────────────────────────
// 5. START THE SERVER
// ───────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});
