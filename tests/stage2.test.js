/**
 * Stage 2 Automated Verification Test Suite
 * Verifies Profile Creation, Dynamic Document Types, Custom Fields, Schema Versioning,
 * Draft/Publish workflow, Multi-tenant Isolation, and Classifier/Structuring configuration generation.
 * Proves that NO business fields are hard-coded!
 */

const ProfileService = require('../backend/src/services/profileService');

async function runStage2Tests() {
  console.log('==================================================');
  console.log('Running Stage 2 Automated Verification Suite');
  console.log('==================================================\n');

  const ORG_A = '00000000-0000-0000-0000-000000000001';
  const ORG_B = '00000000-0000-0000-0000-000000000099';

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      testPassed++;
    } else {
      console.error(`[FAIL] ${message}`);
      testFailed++;
      process.exitCode = 1;
    }
  }

  try {
    // 1. Create Processing Profile
    const profile = await ProfileService.createProfile(ORG_A, {
      name: 'Dynamic Enterprise Ingestion Profile',
      description: 'Fully customizable document profile test'
    });
    assert(profile && profile.profileId, '1. Create processing profile');
    assert(profile.status === 'DRAFT', '1. Profile initialized in DRAFT state');

    // 2. Add Document Type
    const docType = await ProfileService.addDocumentType(ORG_A, profile.profileId, {
      name: 'Custom Patient Intake Form',
      description: 'Medical admission & intake form',
      aliases: ['Intake Form', 'Patient Form']
    });
    assert(docType && docType.key === 'custom_patient_intake_form', '2. Add document type (safe snake_case key generated)');

    // 3. Add Custom Field (Field 1)
    const field1 = await ProfileService.addField(ORG_A, docType.documentTypeId, {
      displayName: 'Patient Full Name',
      description: 'Legal full name of patient',
      dataType: 'string',
      required: true,
      aliases: ['Patient Name', 'Full Name']
    });
    assert(field1 && field1.fieldKey === 'patient_full_name', '3. Add custom field (auto-generated key patient_full_name)');

    // 4. Add Multiple Custom Fields (Field 2 & Field 3)
    const field2 = await ProfileService.addField(ORG_A, docType.documentTypeId, {
      displayName: 'Admission Date',
      dataType: 'date',
      required: true
    });
    const field3 = await ProfileService.addField(ORG_A, docType.documentTypeId, {
      displayName: 'Is Emergency Visit',
      dataType: 'boolean',
      required: false
    });
    assert(field2.fieldKey === 'admission_date' && field3.fieldKey === 'is_emergency_visit', '4. Add multiple custom fields dynamically');

    // 5. Edit Field
    const updatedField1 = await ProfileService.updateField(ORG_A, field1.fieldId, {
      displayName: 'Patient Legal Full Name',
      required: false
    });
    assert(updatedField1.displayName === 'Patient Legal Full Name' && updatedField1.required === false, '5. Edit custom field properties');

    // 6. Disable Field
    const disabledField = await ProfileService.toggleFieldStatus(ORG_A, field3.fieldId, false);
    assert(disabledField.active === false, '6. Disable field (soft-disable)');

    // 7. Re-enable Field
    const enabledField = await ProfileService.toggleFieldStatus(ORG_A, field3.fieldId, true);
    assert(enabledField.active === true, '7. Re-enable field');

    // 8. Prevent Duplicate Field Key
    let duplicateCaught = false;
    try {
      await ProfileService.addField(ORG_A, docType.documentTypeId, {
        displayName: 'Patient Full Name', // Will attempt key: patient_full_name
        dataType: 'string'
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_KEY') duplicateCaught = true;
    }
    assert(duplicateCaught, '8. Prevent duplicate field key within same document type');

    // 9. Prevent Cross-Organization Access
    let crossAccessBlocked = false;
    try {
      await ProfileService.getProfileById(ORG_B, profile.profileId);
    } catch (e) {
      if (e.code === 'NOT_FOUND') crossAccessBlocked = true;
    }
    assert(crossAccessBlocked, '9. Prevent cross-organization tenant access');

    // 10. Save Draft Status Verification
    const draftSchema = await ProfileService.getProfileSchema(ORG_A, profile.profileId);
    assert(draftSchema.status === 'DRAFT', '10. Confirm draft status');

    // 11. Publish Schema
    const publishRes = await ProfileService.publishSchema(ORG_A, profile.profileId);
    assert(publishRes.status === 'PUBLISHED' && publishRes.schemaVersion === 1, '11. Publish schema version');

    // 12. Confirm previous schema version status updated
    const publishedSchema = await ProfileService.getProfileSchema(ORG_A, profile.profileId);
    assert(publishedSchema.status === 'PUBLISHED', '12. Confirm published schema status');

    // 13. Confirm published schema is immutable & dynamic edits trigger new version updates
    const docType2 = await ProfileService.addDocumentType(ORG_A, profile.profileId, {
      name: 'Billing Invoice Form'
    });
    const postEditSchema = await ProfileService.getProfileSchema(ORG_A, profile.profileId);
    assert(postEditSchema.status === 'DRAFT', '13. Modifications post-publish switch profile to DRAFT status for next version');

    // 14. Generate Classifier Configuration
    const classifierConfig = await ProfileService.getClassifierConfig(ORG_A, profile.profileId);
    assert(classifierConfig.documentTypes.length > 0 && classifierConfig.documentTypes[0].name === 'Custom Patient Intake Form', '14. Generate classifier configuration dynamically');

    // 15. Generate Structuring Schema Configuration
    const structuringSchema = await ProfileService.getStructuringSchema(ORG_A, profile.profileId, docType.documentTypeId);
    assert(structuringSchema.fields.length >= 3 && structuringSchema.fields.some(f => f.fieldKey === 'patient_full_name'), '15. Generate structuring schema configuration dynamically');

    // 16. IMPORTANT TEST: Prove system works without hard-coded fields
    console.log('\n--- IMPORTANT TEST: Verifying 0 Hard-coded Business Fields ---');
    const dynamicDocType = await ProfileService.addDocumentType(ORG_A, profile.profileId, {
      name: 'Custom Logistics Manifest',
      description: 'Purely dynamic logistics tracking form'
    });
    const f1 = await ProfileService.addField(ORG_A, dynamicDocType.documentTypeId, { displayName: 'Container Tracking Code', dataType: 'string' });
    const f2 = await ProfileService.addField(ORG_A, dynamicDocType.documentTypeId, { displayName: 'Cargo Weight KG', dataType: 'decimal' });
    const f3 = await ProfileService.addField(ORG_A, dynamicDocType.documentTypeId, { displayName: 'Hazardous Material Flag', dataType: 'boolean' });

    const dynamicStructSchema = await ProfileService.getStructuringSchema(ORG_A, profile.profileId, dynamicDocType.documentTypeId);
    assert(dynamicStructSchema.fields.length === 3, '16. Dynamic document type created with 3 custom fields without any source code modification');
    assert(dynamicStructSchema.fields[0].fieldKey === 'container_tracking_code', '16. Custom field 1 key: container_tracking_code');
    assert(dynamicStructSchema.fields[1].fieldKey === 'cargo_weight_kg', '16. Custom field 2 key: cargo_weight_kg');
    assert(dynamicStructSchema.fields[2].fieldKey === 'hazardous_material_flag', '16. Custom field 3 key: hazardous_material_flag');

    console.log('\n==================================================');
    console.log(`STAGE 2 TEST SUITE SUMMARY: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('==================================================');

  } catch (err) {
    console.error('\nFATAL ERROR during Stage 2 test execution:', err.stack || err.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runStage2Tests();
}

module.exports = { runStage2Tests };
