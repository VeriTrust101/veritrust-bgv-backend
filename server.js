const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '30mb' })); // for JSON
app.use(bodyParser.urlencoded({ extended: true, limit: '30mb' })); // for forms

// MongoDB Candidate model
const CandidateSchema = new mongoose.Schema({
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
  submitted: { type: Boolean, default: false },
  submissionData: { type: Object, default: null }
});
const Candidate = mongoose.model('Candidate', CandidateSchema);

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://veritrust:Veritrust8800@veritrust-cluster.cjmsmak.mongodb.net/veritrust', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// For Excel uploads
const upload = multer({ dest: 'uploads/' });

app.post('/upload-excel', upload.single('excel'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const newCandidates = [];
    for (let row of rows) {
      const uniqueToken = uuidv4();
      const candidate = new Candidate({
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
        state: row['State'] || '',
      });
      await candidate.save();
      newCandidates.push({
        candidateName: candidate.candidateName,
        phoneNumber: candidate.phoneNumber,
        uniqueLink: `http://localhost:8000/candidate-verify.html?token=${uniqueToken}` // for local demo
      });
    }
    res.status(200).json({ message: "Upload successful", candidates: newCandidates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch candidate by token, prevent if already submitted
app.get('/candidate/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    if (candidate.submitted) {
      return res.status(403).json({ error: 'Form already submitted' });
    }
    res.json(candidate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save candidate submission and mark as submitted
app.post('/submit/:token', async (req, res) => {
  try {
    const candidate = await Candidate.findOne({ uniqueToken: req.params.token });
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    if (candidate.submitted) {
      return res.status(403).json({ error: 'Form already submitted' });
    }
    // Save all submitted data and uploaded photos as base64
    candidate.submissionData = req.body;
    candidate.status = 'Submitted';
    candidate.submitted = true;
    await candidate.save();
    res.json({ message: 'Form submitted and link expired.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
