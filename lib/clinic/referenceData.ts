/*
 * The clinic's starting reference data — seeded once on a new database (lib/seed.ts) and then
 * maintained on Clinic Setup. Prices are Kenyan private-clinic cash rates in shillings.
 */

/** The common outpatient ICD-10 set (Kenya OPD morbidity). [code, title, chapter] */
export const ICD10_COMMON: [string, string, string][] = [
  ['A09', 'Infectious gastroenteritis and colitis, unspecified', 'Infectious'], ['A01.0', 'Typhoid fever', 'Infectious'],
  ['A06.0', 'Acute amoebic dysentery', 'Infectious'], ['B50.9', 'Plasmodium falciparum malaria, unspecified', 'Infectious'],
  ['B54', 'Unspecified malaria', 'Infectious'], ['B35.4', 'Tinea corporis', 'Infectious'], ['B37.3', 'Candidiasis of vulva and vagina', 'Infectious'],
  ['B82.9', 'Intestinal parasitism, unspecified', 'Infectious'], ['A15.0', 'Tuberculosis of lung', 'Infectious'], ['B20', 'HIV disease', 'Infectious'],
  ['J00', 'Acute nasopharyngitis (common cold)', 'Respiratory'], ['J02.9', 'Acute pharyngitis, unspecified', 'Respiratory'],
  ['J03.9', 'Acute tonsillitis, unspecified', 'Respiratory'], ['J06.9', 'Acute upper respiratory infection, unspecified', 'Respiratory'],
  ['J18.9', 'Pneumonia, unspecified organism', 'Respiratory'], ['J20.9', 'Acute bronchitis, unspecified', 'Respiratory'],
  ['J30.4', 'Allergic rhinitis, unspecified', 'Respiratory'], ['J45.9', 'Asthma, unspecified', 'Respiratory'], ['J32.9', 'Chronic sinusitis, unspecified', 'Respiratory'],
  ['I10', 'Essential (primary) hypertension', 'Circulatory'], ['I50.9', 'Heart failure, unspecified', 'Circulatory'],
  ['E11.9', 'Type 2 diabetes mellitus without complications', 'Endocrine'], ['E11.65', 'Type 2 diabetes mellitus with hyperglycaemia', 'Endocrine'],
  ['E66.9', 'Obesity, unspecified', 'Endocrine'], ['E86.0', 'Dehydration', 'Endocrine'], ['D64.9', 'Anaemia, unspecified', 'Blood'],
  ['K29.7', 'Gastritis, unspecified', 'Digestive'], ['K21.9', 'Gastro-oesophageal reflux disease without oesophagitis', 'Digestive'],
  ['K59.0', 'Constipation', 'Digestive'], ['K30', 'Functional dyspepsia', 'Digestive'], ['R10.4', 'Other and unspecified abdominal pain', 'Symptoms'],
  ['K02.1', 'Caries of dentine', 'Dental'], ['K02.9', 'Dental caries, unspecified', 'Dental'], ['K04.0', 'Pulpitis', 'Dental'],
  ['K04.7', 'Periapical abscess without sinus', 'Dental'], ['K05.1', 'Chronic gingivitis', 'Dental'], ['K05.3', 'Chronic periodontitis', 'Dental'],
  ['K01.1', 'Impacted teeth', 'Dental'], ['K03.6', 'Deposits (accretions) on teeth', 'Dental'], ['K08.1', 'Loss of teeth due to accident, extraction or local periodontal disease', 'Dental'],
  ['K12.0', 'Recurrent oral aphthae', 'Dental'], ['S02.5', 'Fracture of tooth', 'Dental'],
  ['N39.0', 'Urinary tract infection, site not specified', 'Genitourinary'], ['N76.0', 'Acute vaginitis', 'Genitourinary'], ['N94.6', 'Dysmenorrhoea, unspecified', 'Genitourinary'],
  ['O80', 'Single spontaneous delivery (antenatal follow-up)', 'Pregnancy'], ['Z34.9', 'Supervision of normal pregnancy, unspecified', 'Pregnancy'],
  ['L02.9', 'Cutaneous abscess, unspecified', 'Skin'], ['L03.9', 'Cellulitis, unspecified', 'Skin'], ['L20.9', 'Atopic dermatitis, unspecified', 'Skin'],
  ['L30.9', 'Dermatitis, unspecified', 'Skin'], ['L70.0', 'Acne vulgaris', 'Skin'],
  ['M54.5', 'Low back pain', 'Musculoskeletal'], ['M79.1', 'Myalgia', 'Musculoskeletal'], ['M25.5', 'Pain in joint', 'Musculoskeletal'], ['M17.9', 'Osteoarthritis of knee, unspecified', 'Musculoskeletal'],
  ['H10.9', 'Conjunctivitis, unspecified', 'Eye'], ['H66.9', 'Otitis media, unspecified', 'Ear'], ['H61.2', 'Impacted cerumen', 'Ear'],
  ['G43.9', 'Migraine, unspecified', 'Nervous'], ['R51', 'Headache', 'Symptoms'], ['F41.1', 'Generalised anxiety disorder', 'Mental'], ['F32.9', 'Depressive episode, unspecified', 'Mental'],
  ['R50.9', 'Fever, unspecified', 'Symptoms'], ['R05', 'Cough', 'Symptoms'], ['T14.1', 'Open wound of unspecified body region', 'Injury'],
  ['S93.4', 'Sprain of ankle', 'Injury'], ['T63.4', 'Toxic effect of venom of arthropods (insect bite)', 'Injury'],
  ['Z00.0', 'General adult medical examination', 'Factors'], ['Z23', 'Need for immunisation', 'Factors'], ['Z30.0', 'General counselling on contraception', 'Factors'],
];

/** [code, name, kind, category, department, cash price] — consultations, procedures, nursing, imaging. */
export const CLINIC_SERVICES: [string, string, string, string, string | null, number][] = [
  ['REG', 'Patient registration & file', 'REGISTRATION', 'REGISTRATION', null, 200],
  ['CONS-GP', 'General consultation — Medical Officer', 'CONSULTATION', 'CONSULTATION', 'OPD', 1500],
  ['CONS-CO', 'General consultation — Clinical Officer', 'CONSULTATION', 'CONSULTATION', 'OPD', 1000],
  ['CONS-DEN', 'Dental consultation & examination', 'CONSULTATION', 'CONSULTATION', 'DENTAL', 1500],
  ['CONS-MCH', 'Mother & child clinic consultation', 'CONSULTATION', 'CONSULTATION', 'MCH', 800],
  ['CONS-REV', 'Review consultation', 'CONSULTATION', 'CONSULTATION', 'OPD', 500],
  ['NUR-INJ', 'Injection administration (IM / IV)', 'NURSING', 'PROCEDURES', 'PROC', 200],
  ['NUR-DRS', 'Wound dressing', 'NURSING', 'PROCEDURES', 'PROC', 500],
  ['NUR-NEB', 'Nebulisation', 'NURSING', 'PROCEDURES', 'PROC', 800],
  ['NUR-IVF', 'IV fluids administration (per litre)', 'NURSING', 'PROCEDURES', 'PROC', 1500],
  ['NUR-BP', 'Blood pressure & sugar check (walk-in)', 'NURSING', 'PROCEDURES', 'PROC', 300],
  ['PROC-SUT', 'Suturing (simple laceration)', 'PROCEDURE', 'PROCEDURES', 'PROC', 2500],
  ['PROC-ID', 'Incision & drainage of abscess', 'PROCEDURE', 'PROCEDURES', 'PROC', 3500],
  ['PROC-EAR', 'Ear syringing', 'PROCEDURE', 'PROCEDURES', 'PROC', 1000],
  ['PROC-CIRC', 'Male circumcision (adult)', 'PROCEDURE', 'PROCEDURES', 'PROC', 8000],
  ['PROC-FP', 'Contraceptive implant insertion', 'PROCEDURE', 'PROCEDURES', 'PROC', 2500],
  ['PROC-MED', 'Medical examination & report', 'PROCEDURE', 'OTHER', 'OPD', 2500],
  ['IMG-CXR', 'Chest X-ray (PA)', 'IMAGING', 'IMAGING', 'RAD', 2000],
  ['IMG-XR', 'X-ray — limb / joint', 'IMAGING', 'IMAGING', 'RAD', 1800],
  ['IMG-USABD', 'Ultrasound — abdomen', 'IMAGING', 'IMAGING', 'RAD', 3000],
  ['IMG-USOBS', 'Ultrasound — obstetric', 'IMAGING', 'IMAGING', 'RAD', 2500],
  ['IMG-OPG', 'Dental OPG (panoramic X-ray)', 'IMAGING', 'IMAGING', 'RAD', 2500],
  ['IMG-PA', 'Dental periapical X-ray', 'IMAGING', 'IMAGING', 'DENTAL', 800],
  ['IMG-ECG', 'ECG (12-lead)', 'IMAGING', 'IMAGING', 'RAD', 1500],
];

/** [code, name, cash price] — CDT-style dental procedure codes. */
export const DENTAL_PROCEDURES: [string, string, number][] = [
  ['D-SCALE', 'Scaling & polishing (full mouth)', 3500], ['D-FILL-COMP1', 'Composite filling — 1 surface', 3500],
  ['D-FILL-COMP2', 'Composite filling — 2+ surfaces', 5000], ['D-FILL-AMAL', 'Amalgam filling', 2500], ['D-FILL-GIC', 'Glass ionomer filling (temporary)', 2000],
  ['D-EXT', 'Simple extraction', 2000], ['D-SURGEXT', 'Surgical extraction (impacted tooth)', 9000], ['D-RCT-ANT', 'Root canal treatment — anterior', 12000],
  ['D-RCT-POST', 'Root canal treatment — molar', 18000], ['D-CROWN-PFM', 'Crown — porcelain fused to metal', 25000], ['D-CROWN-ZR', 'Crown — zirconia', 35000],
  ['D-SEAL', 'Fissure sealant (per tooth)', 1500], ['D-FLUOR', 'Fluoride application', 1500], ['D-WHITE', 'Teeth whitening (in-office)', 20000],
  ['D-DENT-PART', 'Partial denture (acrylic)', 18000], ['D-DENT-FULL', 'Full denture (per arch)', 30000], ['D-IMPL', 'Dental implant (fixture & crown)', 120000],
  ['D-VEN', 'Porcelain veneer', 30000], ['D-PULP', 'Pulpotomy (primary tooth)', 4000], ['D-PERIO', 'Deep scaling & root planing (per quadrant)', 4000],
];

/** Lab catalogue. Parameter: [name, unit, type, options|null, low, high, lowF, highF, critLow, critHigh, refText|null] */
type P = [string, string | null, 'NUMERIC' | 'TEXT' | 'OPTION', string | null, number | null, number | null, number | null, number | null, number | null, number | null, string | null];
export const LAB_CATALOGUE: { code: string; name: string; section: string; specimen: string; tat: number; price: number; container: string; params: P[] }[] = [
  { code: 'FBC', name: 'Full Blood Count (FBC / CBC)', section: 'HAEMATOLOGY', specimen: 'BLOOD', tat: 60, price: 1200, container: 'EDTA (purple)', params: [
    ['Haemoglobin', 'g/dL', 'NUMERIC', null, 13, 17, 12, 15.5, 7, 20, null], ['WBC', '×10⁹/L', 'NUMERIC', null, 4, 11, null, null, 2, 30, null],
    ['Neutrophils', '%', 'NUMERIC', null, 40, 75, null, null, null, null, null], ['Lymphocytes', '%', 'NUMERIC', null, 20, 45, null, null, null, null, null],
    ['Platelets', '×10⁹/L', 'NUMERIC', null, 150, 400, null, null, 50, 1000, null], ['Haematocrit', '%', 'NUMERIC', null, 40, 52, 36, 46, null, null, null],
    ['MCV', 'fL', 'NUMERIC', null, 80, 100, null, null, null, null, null]] },
  { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', section: 'HAEMATOLOGY', specimen: 'BLOOD', tat: 90, price: 500, container: 'Citrate (black)', params: [['ESR', 'mm/hr', 'NUMERIC', null, 0, 15, 0, 20, null, null, null]] },
  { code: 'BSMP', name: 'Malaria — blood slide (BS for MPS)', section: 'PARASITOLOGY', specimen: 'BLOOD', tat: 30, price: 400, container: 'EDTA (purple)', params: [['Malaria parasites', null, 'OPTION', 'Not seen, Seen +, Seen ++, Seen +++', null, null, null, null, null, null, null]] },
  { code: 'MRDT', name: 'Malaria rapid diagnostic test (mRDT)', section: 'PARASITOLOGY', specimen: 'BLOOD', tat: 20, price: 500, container: 'Finger prick', params: [['P. falciparum antigen', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null]] },
  { code: 'WIDAL', name: 'Salmonella antigen (stool) / Typhoid', section: 'SEROLOGY', specimen: 'STOOL', tat: 45, price: 800, container: 'Stool container', params: [['Salmonella typhi antigen', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null]] },
  { code: 'HPYL', name: 'H. pylori stool antigen', section: 'SEROLOGY', specimen: 'STOOL', tat: 45, price: 1200, container: 'Stool container', params: [['H. pylori antigen', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null]] },
  { code: 'RBS', name: 'Random blood sugar', section: 'BIOCHEMISTRY', specimen: 'BLOOD', tat: 15, price: 300, container: 'Finger prick', params: [['Glucose (random)', 'mmol/L', 'NUMERIC', null, 3.9, 7.8, null, null, 2.5, 25, null]] },
  { code: 'FBS', name: 'Fasting blood sugar', section: 'BIOCHEMISTRY', specimen: 'BLOOD', tat: 15, price: 300, container: 'Finger prick', params: [['Glucose (fasting)', 'mmol/L', 'NUMERIC', null, 3.9, 5.6, null, null, 2.5, 25, null]] },
  { code: 'HBA1C', name: 'HbA1c (glycated haemoglobin)', section: 'BIOCHEMISTRY', specimen: 'BLOOD', tat: 120, price: 2500, container: 'EDTA (purple)', params: [['HbA1c', '%', 'NUMERIC', null, 4, 5.6, null, null, null, 14, '< 5.7 normal · 5.7–6.4 pre-diabetes · ≥ 6.5 diabetes']] },
  { code: 'UEC', name: 'Urea, electrolytes & creatinine (U/E/C)', section: 'BIOCHEMISTRY', specimen: 'SERUM', tat: 120, price: 2500, container: 'Plain (red)', params: [
    ['Sodium', 'mmol/L', 'NUMERIC', null, 135, 145, null, null, 120, 160, null], ['Potassium', 'mmol/L', 'NUMERIC', null, 3.5, 5.1, null, null, 2.5, 6.5, null],
    ['Chloride', 'mmol/L', 'NUMERIC', null, 98, 107, null, null, null, null, null], ['Urea', 'mmol/L', 'NUMERIC', null, 2.5, 7.1, null, null, null, 30, null],
    ['Creatinine', 'µmol/L', 'NUMERIC', null, 62, 115, 53, 97, null, 500, null]] },
  { code: 'LFT', name: 'Liver function tests', section: 'BIOCHEMISTRY', specimen: 'SERUM', tat: 180, price: 3000, container: 'Plain (red)', params: [
    ['ALT', 'U/L', 'NUMERIC', null, 7, 56, null, null, null, null, null], ['AST', 'U/L', 'NUMERIC', null, 10, 40, null, null, null, null, null],
    ['ALP', 'U/L', 'NUMERIC', null, 44, 147, null, null, null, null, null], ['Total bilirubin', 'µmol/L', 'NUMERIC', null, 3, 21, null, null, null, null, null],
    ['Albumin', 'g/L', 'NUMERIC', null, 35, 50, null, null, null, null, null]] },
  { code: 'LIPID', name: 'Lipid profile', section: 'BIOCHEMISTRY', specimen: 'SERUM', tat: 180, price: 2800, container: 'Plain (red)', params: [
    ['Total cholesterol', 'mmol/L', 'NUMERIC', null, null, 5.2, null, null, null, null, null], ['HDL', 'mmol/L', 'NUMERIC', null, 1.0, null, 1.3, null, null, null, null],
    ['LDL', 'mmol/L', 'NUMERIC', null, null, 3.4, null, null, null, null, null], ['Triglycerides', 'mmol/L', 'NUMERIC', null, null, 1.7, null, null, null, null, null]] },
  { code: 'URINE', name: 'Urinalysis', section: 'URINALYSIS', specimen: 'URINE', tat: 30, price: 500, container: 'Urine container', params: [
    ['Appearance', null, 'OPTION', 'Clear, Cloudy, Turbid', null, null, null, null, null, null, null], ['Protein', null, 'OPTION', 'Negative, Trace, +, ++, +++', null, null, null, null, null, null, null],
    ['Glucose', null, 'OPTION', 'Negative, Trace, +, ++, +++', null, null, null, null, null, null, null], ['Leucocytes', null, 'OPTION', 'Negative, +, ++, +++', null, null, null, null, null, null, null],
    ['Nitrites', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null], ['Pus cells', '/hpf', 'NUMERIC', null, 0, 5, null, null, null, null, null]] },
  { code: 'STOOL', name: 'Stool for ova & cysts', section: 'PARASITOLOGY', specimen: 'STOOL', tat: 45, price: 400, container: 'Stool container', params: [
    ['Consistency', null, 'OPTION', 'Formed, Semi-formed, Loose, Watery', null, null, null, null, null, null, null], ['Ova / cysts', null, 'OPTION', 'None seen, E. histolytica, G. lamblia, Hookworm, A. lumbricoides', null, null, null, null, null, null, null]] },
  { code: 'HIV', name: 'HIV 1 & 2 rapid test (with counselling)', section: 'SEROLOGY', specimen: 'BLOOD', tat: 30, price: 0, container: 'Finger prick', params: [['HIV 1/2 antibodies', null, 'OPTION', 'Non-reactive, Reactive', null, null, null, null, null, null, null]] },
  { code: 'PDT', name: 'Pregnancy test (urine hCG)', section: 'IMMUNOLOGY', specimen: 'URINE', tat: 15, price: 300, container: 'Urine container', params: [['hCG', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null]] },
  { code: 'CRP', name: 'C-reactive protein', section: 'IMMUNOLOGY', specimen: 'SERUM', tat: 60, price: 1500, container: 'Plain (red)', params: [['CRP', 'mg/L', 'NUMERIC', null, 0, 10, null, null, null, 200, null]] },
  { code: 'TSH', name: 'Thyroid stimulating hormone', section: 'HORMONES', specimen: 'SERUM', tat: 240, price: 2500, container: 'Plain (red)', params: [['TSH', 'mIU/L', 'NUMERIC', null, 0.4, 4.0, null, null, null, null, null]] },
  { code: 'BGRP', name: 'Blood group & Rhesus', section: 'HAEMATOLOGY', specimen: 'BLOOD', tat: 30, price: 500, container: 'EDTA (purple)', params: [['ABO / Rh', null, 'TEXT', null, null, null, null, null, null, null, 'Report as e.g. O Rh+']] },
  { code: 'HBSAG', name: 'Hepatitis B surface antigen', section: 'SEROLOGY', specimen: 'BLOOD', tat: 30, price: 800, container: 'Plain (red)', params: [['HBsAg', null, 'OPTION', 'Negative, Positive', null, null, null, null, null, null, null]] },
];

/** Formulary: [generic, brand, strength, form, route, frequency, unit, cost, price, opening stock, reorder at, controlled] */
export const DRUG_FORMULARY: [string, string | null, string, string, string, string, string, number, number, number, number, 0 | 1][] = [
  ['Paracetamol', 'Panadol', '500 mg', 'TABLET', 'PO', 'TDS', 'TAB', 1, 5, 6000, 1000, 0],
  ['Ibuprofen', 'Brufen', '400 mg', 'TABLET', 'PO', 'TDS', 'TAB', 2, 10, 3000, 500, 0],
  ['Diclofenac', 'Voltaren', '50 mg', 'TABLET', 'PO', 'BD', 'TAB', 2, 10, 2000, 400, 0],
  ['Amoxicillin', 'Amoxil', '500 mg', 'CAPSULE', 'PO', 'TDS', 'CAP', 4, 20, 4000, 600, 0],
  ['Amoxicillin/Clavulanate', 'Augmentin', '625 mg', 'TABLET', 'PO', 'BD', 'TAB', 25, 80, 1500, 300, 0],
  ['Azithromycin', 'Zithromax', '500 mg', 'TABLET', 'PO', 'OD', 'TAB', 20, 70, 800, 150, 0],
  ['Ciprofloxacin', 'Ciprobay', '500 mg', 'TABLET', 'PO', 'BD', 'TAB', 6, 25, 1500, 300, 0],
  ['Metronidazole', 'Flagyl', '400 mg', 'TABLET', 'PO', 'TDS', 'TAB', 2, 10, 3000, 500, 0],
  ['Doxycycline', null, '100 mg', 'CAPSULE', 'PO', 'BD', 'CAP', 4, 15, 1000, 200, 0],
  ['Artemether/Lumefantrine', 'Coartem', '20/120 mg', 'TABLET', 'PO', 'BD', 'TAB', 15, 40, 2400, 480, 0],
  ['Omeprazole', 'Losec', '20 mg', 'CAPSULE', 'PO', 'OD', 'CAP', 4, 20, 2000, 300, 0],
  ['Amlodipine', 'Norvasc', '5 mg', 'TABLET', 'PO', 'OD', 'TAB', 2, 10, 3000, 500, 0],
  ['Losartan', 'Cozaar', '50 mg', 'TABLET', 'PO', 'OD', 'TAB', 5, 20, 2000, 400, 0],
  ['Metformin', 'Glucophage', '500 mg', 'TABLET', 'PO', 'BD', 'TAB', 2, 8, 4000, 600, 0],
  ['Salbutamol inhaler', 'Ventolin', '100 mcg/dose', 'INHALER', 'INH', 'PRN', 'PCS', 350, 700, 60, 15, 0],
  ['Cetirizine', 'Zyrtec', '10 mg', 'TABLET', 'PO', 'OD', 'TAB', 2, 10, 2000, 300, 0],
  ['Oral rehydration salts', 'ORS', '20.5 g sachet', 'SUSPENSION', 'PO', 'PRN', 'PCS', 15, 40, 400, 100, 0],
  ['Zinc sulphate', null, '20 mg', 'TABLET', 'PO', 'OD', 'TAB', 3, 10, 1000, 200, 0],
  ['Amoxicillin suspension', 'Amoxil', '250 mg/5 ml 100 ml', 'SUSPENSION', 'PO', 'TDS', 'BTL', 90, 250, 150, 30, 0],
  ['Paracetamol syrup', 'Calpol', '120 mg/5 ml 100 ml', 'SYRUP', 'PO', 'TDS', 'BTL', 70, 200, 150, 30, 0],
  ['Ceftriaxone injection', 'Rocephin', '1 g vial', 'INJECTION', 'IV', 'OD', 'VIAL', 120, 400, 200, 40, 0],
  ['Diclofenac injection', null, '75 mg/3 ml', 'INJECTION', 'IM', 'STAT', 'VIAL', 20, 100, 200, 40, 0],
  ['Clotrimazole cream', 'Canesten', '1% 20 g', 'CREAM', 'TOP', 'BD', 'TUBE', 80, 250, 100, 20, 0],
  ['Hydrocortisone cream', null, '1% 15 g', 'CREAM', 'TOP', 'BD', 'TUBE', 70, 200, 80, 20, 0],
  ['Chlorhexidine mouthwash', 'Corsodyl', '0.2% 300 ml', 'MOUTHWASH', 'BUCCAL', 'BD', 'BTL', 300, 650, 60, 15, 0],
  ['Lidocaine with adrenaline (dental cartridge)', 'Xylocaine', '2% 1.8 ml', 'INJECTION', 'SC', 'STAT', 'VIAL', 40, 150, 300, 60, 0],
  ['Tramadol', 'Tramal', '50 mg', 'CAPSULE', 'PO', 'TDS', 'CAP', 6, 25, 500, 100, 1],
  ['Folic acid', null, '5 mg', 'TABLET', 'PO', 'OD', 'TAB', 1, 5, 2000, 300, 0],
  ['Ferrous sulphate', null, '200 mg', 'TABLET', 'PO', 'OD', 'TAB', 1, 5, 2000, 300, 0],
  ['Albendazole', 'Zentel', '400 mg', 'TABLET', 'PO', 'STAT', 'TAB', 8, 40, 600, 100, 0],
];
