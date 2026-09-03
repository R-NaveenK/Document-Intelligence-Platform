const express = require('express');
const router = express.Router();
const ChatService = require('../services/chatService');
const { extractTenantContext } = require('../middleware/tenantContext');

router.use(extractTenantContext);

// Process natural language user question
router.post(['/chat/query', '/chat/sessions/:sessionId/messages'], async (req, res) => {
  try {
    const payload = {
      ...req.body,
      sessionId: req.params.sessionId || req.body.sessionId
    };
    const data = await ChatService.processUserMessage(req.tenant.organizationId, payload);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'CHAT_QUERY_ERROR', message: err.message }
    });
  }
});

// Create new chat session
router.post('/chat/sessions', async (req, res) => {
  try {
    const session = await ChatService.createSession(req.tenant.organizationId, req.body.title);
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// List chat sessions
router.get('/chat/sessions', async (req, res) => {
  try {
    const sessions = await ChatService.listSessions(req.tenant.organizationId);
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

// Get session history
router.get('/chat/sessions/:sessionId', async (req, res) => {
  try {
    const history = await ChatService.getSessionHistory(req.tenant.organizationId, req.params.sessionId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(err.status || (err.code === 'NOT_FOUND' ? 404 : 500)).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message }
    });
  }
});

module.exports = router;
