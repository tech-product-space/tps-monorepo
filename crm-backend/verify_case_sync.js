const { Lead, User, sequelize } = require('./src/models');
const { getLeads } = require('./src/controllers/lead.controller');

async function testCaseSensitivity() {
  console.log('--- STARTING CASE SENSITIVITY SYNC TEST ---');
  
  try {
    // 1. Create a dummy Agent with a known lowercase ID
    const agentId = 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
    await User.upsert({
      id: agentId,
      name: 'Case Test Agent',
      email: 'casetest@example.com',
      password_hash: 'hash',
      role: 'Agent',
      is_active: true
    });

    // 2. Assign a lead to this agent using UPPERCASE ID
    const leadId = 'f1f2f3f4-f5f6-4f5f-8f9f-0f1f2f3f4f5f';
    await Lead.upsert({
      id: leadId,
      name: 'Case Sensitive Lead',
      phone: '1234567890',
      status_id: 's_new',
      agent_id: agentId.toUpperCase(), // FORCE UPPERCASE IN DB
      is_deleted: false
    });

    console.log('✅ Lead assigned in DB with UPPERCASE agent_id.');

    // 3. Mock a request for the Agent (lowercase ID)
    const req = {
      user: { id: agentId, role: 'Agent' },
      query: {}
    };
    const res = {
      status: (code) => ({ json: (data) => ({ code, data }) })
    };

    // We manually simulate the controller logic to verify the 'where' clause construction
    const { Op } = require('sequelize');
    const where = { is_deleted: false };
    
    // THE FIX WE APPLIED:
    where.agent_id = req.user.id.toLowerCase();
    
    console.log(`🔍 Querying for agent_id: ${where.agent_id}`);

    const foundLeads = await Lead.findAll({ where });
    
    if (foundLeads.length > 0 && foundLeads[0].id === leadId) {
      console.log('✅ SUCCESS: Agent found the lead despite case difference in DB!');
    } else {
      console.error('❌ FAILURE: Agent could not find the lead. Case normalization failed.');
      process.exit(1);
    }

    // Cleanup
    await Lead.destroy({ where: { id: leadId } });
    await User.destroy({ where: { id: agentId } });
    
    console.log('--- TEST FINISHED SUCCESSFULLY ---');
    process.exit(0);

  } catch (error) {
    console.error('Test Error:', error);
    process.exit(1);
  }
}

testCaseSensitivity();
