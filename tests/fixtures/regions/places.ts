/**
 * Synthetic place spellings per region, as job boards write them (districts,
 * codes, Arabic and Indian scripts). Shared by the pipeline-loss tests
 * (tests/unit/region-survival.test.ts) and the coverage matrix script
 * (scripts/coverage-matrix.ts). No real postings.
 */

export const PLACES: Readonly<Record<string, readonly string[]>> = {
  kw: [
    'Kuwait City, Kuwait', 'Salmiya', 'Salmiyah, Hawalli Governorate', 'Shuwaikh Industrial Area', 'Farwaniya',
    'Al Farwaniyah', 'Mangaf', 'Fahaheel', 'Jahra', 'Al Jahra', 'Ahmadi', 'Al Ahmadi', 'Mubarak Al-Kabeer',
    'Mubarak Al Kabir', 'Hawally', 'Hawalli', 'KW', 'KWT', 'State of Kuwait', 'الكويت', 'السالمية', 'حولي',
    'الفروانية', 'الجهراء', 'الأحمدي', 'مبارك الكبير', 'الشويخ', 'Sharq', 'Khaitan', 'Jabriya', 'Egaila',
    'Kuwait - Kuwait City', 'KW-Kuwait', 'Al Rai', 'Qurain',
  ],
  ae: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'DIFC', 'Dubai Internet City', 'AE', 'UAE', 'Dubai - United Arab Emirates', 'دبي',
    'Al Barsha', 'Jumeirah', 'TECOM', 'KIZAD', 'DAFZA', 'Al Reem Island', 'Hamriyah Free Zone', 'twofour54',
    'Sheikh Zayed Road', 'Motor City', 'Al Qusais',
  ],
  sa: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar', 'Al-Khobar', 'Dhahran', 'KSA', 'الرياض', 'Olaya, Riyadh', 'KAUST', 'Jizan', 'Al Ahsa', 'Hofuf', 'Qatif', 'Khamis Mushait'],
  qa: ['Doha', 'Lusail', 'West Bay', 'QFC', 'Al Sadd', 'Doha, QA', 'الدوحة', 'Al Khor'],
  bh: ['Manama', 'Seef', 'Bahrain Bay', 'Sanabis', 'Juffair', 'Hidd', 'Isa Town', 'Diplomatic Area'],
  om: ['Muscat', 'Al Khuwair', 'Ruwi', 'Qurum', 'Ghala', 'Bausher', 'Seeb', 'مسقط', 'Madinat Sultan Qaboos', 'Azaiba'],
  kochi: ['Kochi', 'Cochin', 'Kakkanad', 'Infopark', 'Ernakulam', 'കൊച്ചി', 'Vyttila', 'Aluva'],
  kozhikode: ['Calicut', 'Kozhikode', 'UL Cyberpark', 'കോഴിക്കോട്'],
  thiruvananthapuram: ['Trivandrum', 'Technopark', 'Technopark Phase III', 'തിരുവനന്തപുരം', 'Kazhakkoottam'],
  bengaluru: ['Bangalore', 'Bengaluru Urban', 'Whitefield', 'Marathahalli', 'JP Nagar', 'Sarjapur Road', 'बेंगलुरु', 'ಬೆಂಗಳೂರು'],
  hyderabad: ['Hyderabad', 'HITEC City', 'Gachibowli', 'Nanakramguda', 'Kokapet', 'हैदराबाद'],
  chennai: ['Chennai', 'OMR, Chennai', 'Taramani', 'Perungudi', 'சென்னை'],
  pune: ['Pune', 'Hinjewadi', 'Kharadi', 'Viman Nagar', 'Wakad', 'पुणे'],
  'delhi-ncr': ['Gurgaon', 'Noida Sector 62', 'New Delhi', 'Udyog Vihar', 'Okhla', 'दिल्ली'],
  mumbai: ['Mumbai', 'Powai', 'Andheri', 'Airoli', 'Vikhroli', 'मुंबई'],
}
