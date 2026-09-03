# Hackathon Judging Demo Sequence

Follow this step-by-step walkthrough sequence during judging demonstrations to showcase the full Intelligent Document Processing Platform and its Living Schema capability.

---

## 1. Setup & Startup

1. Run database migrations:
   ```bash
   node database/migrate.js
   ```
2. Start backend server:
   ```bash
   cd backend && npm start
   ```
3. Open `frontend/index.html` in your web browser.

---

## 2. Live Demo Steps

### Step 1: Processing Profile & Dynamic Custom Fields (Stage 2)
1. Click **"Processing Profiles ⚙️"** tab.
2. Click **"+ Create New Profile"** -> Name: `"Healthcare Ingestion Profile"`.
3. Click **"+ Add Document Type"** -> Name: `"Patient Admission Form"`.
4. Click **"+ Add Custom Field"** -> Name: `"Patient Name"` (`patient_name`, string).
5. Click **"+ Add Custom Field"** -> Name: `"Admission Date"` (`admission_date`, date).
6. Click **"Publish Schema Version"** (Schema Version 1).

### Step 2: Document Ingestion & Pipeline (Stage 3 & 4)
1. Click **"Upload Documents 📤"** tab.
2. Select `"Healthcare Ingestion Profile"`.
3. Upload sample PDF/PNG documents.
4. Observe duplicate check, file validation, SHA-256 calculation, and job status `QUEUED`.

### Step 3: Human Review Queue (Stage 5)
1. Click **"Human Review Queue 👁️"** tab.
2. Open any low-confidence item. Inspect original bounding box evidence, correct value, and save correction.

### Step 4: Structured Data Search & AI Chat (Stage 6 & 7)
1. Click **"Records & Search 🔍"** tab.
2. Perform dynamic field queries (e.g. `patient_name` contains `"Jane"`).
3. Click **"AI Chat 💬"** tab.
4. Ask natural language question: *"How many admission forms were processed?"* or *"What is the total sum of bill_amount?"*.
5. Inspect exact grounded database aggregate metric.

### Step 5: Multi-Format Exports (Stage 8)
1. Click **"Export & Reports 📊"** tab.
2. Select CSV, Excel, or JSON format. Click **"Generate Export File 💾"**.
3. Open exported file to verify `effectiveValue` resolution and formula injection protection.

### Step 6: Living Schema & Historical Reprocessing (Stage 9 Flagship Feature!)
1. Click **"Processing Profiles ⚙️"** tab.
2. Open `"Healthcare Ingestion Profile"`.
3. Click **"+ Add Custom Field"** -> Name: `"Insurance Reference Number"` (`insurance_ref`, string).
4. Click **"Publish Schema Version"** (Schema Version 2).
5. Click **"Living Schema 🔄"** tab -> Click **"Preview Eligibility"** -> Click **"Start Reprocessing Job 🚀"**.
6. Observe: Newly added field `insurance_ref` is extracted from stored raw evidence **without document re-upload or OCR rerun**!
7. Re-open **Records & Search** or **AI Chat** -> Ask *"Show records with insurance reference number"* to verify enriched historical records!
