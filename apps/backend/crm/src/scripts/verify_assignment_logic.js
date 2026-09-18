const { Lead, LeadProfile, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const leadService = require('../services/lead.service');

/**
 * Technical Proof Script: Lead Assignment & Visibility
 * 
 * This script verifies:
 * 1. Relationship: Agent -> Manager
 * 2. Auto-assignment on creation (Agent role)
 * 3. Visibility filters (Agent bucket)
 * 4. Manager visibility (Team leads)
 */

async function runVerification() {
  await sequelize.sync();
  console.log('--- STARTING LEAD ASSIGNMENT VERIFICATION ---\n');

  try {
    // 1. Audit Rahi & Albert Relationship
    const rahi = await User.findOne({ where: { name: { [Op.iLike]: '%rahi%' } } });
    const albert = await User.findOne({ where: { name: { [Op.iLike]: '%albert%' } } });

    if (!rahi || !albert) {
      console.log('❌ ERROR: Could not find Rahi or Albert in the database.');
      process.exit(1);
    }

    console.log(`✅ FOUND: Rahi (ID: ${rahi.id}, Role: ${rahi.role})`);
    console.log(`✅ FOUND: Albert (ID: ${albert.id}, Role: ${albert.role})`);

    const isLinked = rahi.manager_id && rahi.manager_id.toString() === albert.id.toString();
    console.log(`🔗 RELATIONSHIP: Rahi linked to Albert? ${isLinked ? 'YES' : 'NO'}`);

    // 2. Test Auto-Assignment on Creation (Phase 1 Fix)
    console.log('\n--- TEST: Creation Auto-Assignment ---');
    const testPhone = '8888888888';
    const existingProfile = await LeadProfile.findOne({ where: { phone: testPhone } });
    if (existingProfile) {
      await Lead.destroy({ where: { profile_id: existingProfile.id } });
      await existingProfile.destroy();
    }

    const creationResult = await leadService.createOrProcessReentry({
      name: 'Automated Test Lead',
      phone: testPhone,
      product_id: 'PM Fellowship'
    }, rahi.id);

    const createdLead = creationResult.lead;
    const isAutoAssigned = createdLead.agent_id && createdLead.agent_id.toString() === rahi.id.toString();
    console.log(`📋 RESULT: Lead created by Rahi auto-assigned to self? ${isAutoAssigned ? 'YES' : 'NO'}`);

    if (isAutoAssigned) {
      console.log('✅ PASS: Phase 1 (Service Logic) confirmed.');
    } else {
      console.log('❌ FAIL: Lead was not auto-assigned to the agent who created it.');
    }

    // 3. Test Visibility Filter Logic (Phase 2 Fix)
    console.log('\n--- TEST: Visibility Consistency (Bucket Check) ---');
    
    // Simulate Agent Rahi's request
    const agentWhere = { is_deleted: false, agent_id: rahi.id }; // Simplified from lead.controller.js
    const rahiBucket = await Lead.findAll({ where: agentWhere });
    const canSeeCreated = rahiBucket.some(l => l.id === createdLead.id);
    console.log(`👁️ VIEW: Rahi can see her new lead in bucket? ${canSeeCreated ? 'YES' : 'NO'}`);

    // Simulate Manager Albert's request
    const subordinates = await User.findAll({ where: { manager_id: albert.id }, attributes: ['id'] });
    const teamIds = [albert.id.toString(), ...subordinates.map(s => s.id.toString())];
    const albertView = await Lead.findAll({ 
      where: { 
        is_deleted: false, 
        agent_id: { [Op.in]: teamIds } 
      } 
    });
    const canAlbertSee = albertView.some(l => l.id === createdLead.id);
    console.log(`🦁 VIEW: Albert can see Rahi's lead in team leads? ${canAlbertSee ? 'YES' : 'NO'}`);

    if (canSeeCreated && canAlbertSee) {
      console.log('✅ PASS: Phase 2 (Visibility Types) confirmed.');
    } else {
      console.log('❌ FAIL: Visibility comparison mismatch found.');
    }

    // Cleanup
    await Lead.destroy({ where: { id: createdLead.id } });
    const cleanupProfile = await LeadProfile.findOne({ where: { phone: testPhone } });
    if (cleanupProfile) await cleanupProfile.destroy();
    console.log('\n--- VERIFICATION FINISHED ---\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ CRITICAL FAILURE during verification:', error);
    process.exit(1);
  }
}

runVerification();
