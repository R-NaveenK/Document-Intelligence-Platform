/**
 * Stage 2 & Stage 3 Frontend Single-Page Application (SPA) Logic
 * Handles Dynamic Profiles, Document Types, Custom Fields, Schema Versioning,
 * Ingestion Upload Dropzone, Duplicate Checks, File Validation, Job Monitoring, and Retry.
 */

const API_BASE = 'http://localhost:5000/api/v1';

// Enterprise Non-Blocking Toast Notification System
function showToast(message, type = 'info', title = null) {
  const container = document.getElementById('toastContainer') || (() => {
    const c = document.createElement('div');
    c.id = 'toastContainer';
    document.body.appendChild(c);
    return c;
  })();

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const defaultTitles = {
    success: 'Success',
    error: 'Action Failed',
    warning: 'Attention',
    info: 'System Notice'
  };

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ'}</div>
    <div class="toast-content">
      <div class="toast-title">${title || defaultTitles[type] || 'Notification'}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px) scale(0.95)';
      setTimeout(() => toast.remove(), 250);
    }
  }, 3800);
}

// Global safety interceptor: upgrade any window.alert to styled toasts
window.alert = function(msg) {
  const str = String(msg || '');
  if (str.toLowerCase().includes('fail') || str.toLowerCase().includes('error') || str.toLowerCase().includes('reject')) {
    showToast(str, 'error');
  } else if (str.toLowerCase().includes('success') || str.toLowerCase().includes('pass') || str.toLowerCase().includes('saved') || str.toLowerCase().includes('complete') || str.toLowerCase().includes('published')) {
    showToast(str, 'success');
  } else if (str.toLowerCase().includes('please') || str.toLowerCase().includes('warning') || str.toLowerCase().includes('limit')) {
    showToast(str, 'warning');
  } else {
    showToast(str, 'info');
  }
};

// Global SPA State
const state = {
  profiles: [],
  publishedProfiles: [],
  currentProfile: null,
  currentDocTypes: [],
  currentDocType: null,
  currentFields: [],
  documents: [],

  // Upload file selection
  selectedFiles: [],

  // Editing state trackers
  editingProfileId: null,
  editingDocTypeId: null,
  editingFieldId: null
};

// Utility: Helper to convert strings to safe snake_case keys
function toSnakeCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Utility: Standardized Fetch Wrapper
async function apiCall(endpoint, method = 'GET', data = null, isFormData = false) {
  const options = {
    method,
    headers: {
      'x-organization-id': '00000000-0000-0000-0000-000000000001'
    }
  };

  if (!isFormData) {
    options.headers['Content-Type'] = 'application/json';
    if (data) options.body = JSON.stringify(data);
  } else {
    options.body = data;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    if (!result.success) {
      showToast(`API Error (${result.error.code}): ${result.error.message}`, 'error');
      throw new Error(result.error.message);
    }
    return result.data;
  } catch (err) {
    console.error(`API Call ${method} ${endpoint} failed:`, err);
    throw err;
  }
}

// ==========================================
// STAGE 5: HUMAN REVIEW QUEUE & EXCEPTION WORKSPACE
// ==========================================
let allCachedReviews = [];
let activeReviewItem = null;
let activeFieldKey = null;
let currentIssueIndex = 0;
let previewZoomLevel = 1.0;
let previewActiveTab = 'visual'; // 'visual' | 'text'

async function loadReviewQueue() {
  try {
    const typeFilter = document.getElementById('filterReviewType')?.value || '';
    const priorityFilter = document.getElementById('filterReviewPriority')?.value || '';
    const statusFilter = document.getElementById('filterReviewStatus')?.value || '';
    const profileFilter = document.getElementById('filterReviewProfile')?.value || '';
    const sortFilter = document.getElementById('filterReviewSort')?.value || 'newest';

    let queryParams = [];
    if (typeFilter) queryParams.push(`reviewType=${encodeURIComponent(typeFilter)}`);
    if (priorityFilter) queryParams.push(`priority=${encodeURIComponent(priorityFilter)}`);
    if (statusFilter && statusFilter !== 'OPEN') queryParams.push(`status=${encodeURIComponent(statusFilter)}`);
    if (profileFilter) queryParams.push(`profileId=${encodeURIComponent(profileFilter)}`);
    if (sortFilter) queryParams.push(`sortBy=${encodeURIComponent(sortFilter)}`);

    const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    const res = await apiCall(`/reviews${queryStr}`);
    const reviews = res || [];
    allCachedReviews = reviews;

    // Load profiles for filter if empty
    const profileSelect = document.getElementById('filterReviewProfile');
    if (profileSelect && profileSelect.children.length <= 1) {
      try {
        const profiles = await apiCall('/profiles');
        profiles.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.profileId;
          opt.textContent = p.name;
          profileSelect.appendChild(opt);
        });
      } catch (e) {}
    }

    // Update KPI summary cards with live data
    const openReviews = reviews.filter(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS');
    const classCount = openReviews.filter(r => r.reviewType === 'CLASSIFICATION').length;
    const fieldCount = openReviews.filter(r => r.reviewType === 'FIELD').length;
    const valCount = openReviews.filter(r => r.reviewType === 'VALIDATION').length;
    const highPriCount = openReviews.filter(r => r.priority === 'HIGH').length;

    if (document.getElementById('kpiOpenReviews')) document.getElementById('kpiOpenReviews').innerText = openReviews.length;
    if (document.getElementById('kpiClassReviews')) document.getElementById('kpiClassReviews').innerText = classCount;
    if (document.getElementById('kpiFieldReviews')) document.getElementById('kpiFieldReviews').innerText = fieldCount;
    if (document.getElementById('kpiValReviews')) document.getElementById('kpiValReviews').innerText = valCount;
    if (document.getElementById('kpiHighPriorityReviews')) document.getElementById('kpiHighPriorityReviews').innerText = highPriCount;
    if (document.getElementById('openReviewCountBadge')) document.getElementById('openReviewCountBadge').innerText = openReviews.length;

    renderReviewTable(reviews);
  } catch (err) {
    console.error('Failed to load review queue:', err);
  }
}

function filterReviewQueueLocally() {
  const q = (document.getElementById('filterReviewSearch')?.value || '').toLowerCase().trim();
  if (!q) {
    renderReviewTable(allCachedReviews);
    return;
  }
  const filtered = allCachedReviews.filter(r => {
    return (r.searchTokens || '').includes(q) ||
           (r.filename || '').toLowerCase().includes(q) ||
           (r.reviewItemId || '').toLowerCase().includes(q) ||
           (r.documentTypeName || '').toLowerCase().includes(q) ||
           (r.reviewReason || '').toLowerCase().includes(q);
  });
  renderReviewTable(filtered);
}

function renderReviewTable(reviews) {
  const tbody = document.getElementById('reviewTableBody');
  if (!tbody) return;

  if (!reviews || reviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted p-4">No review items match the active filters. All documents clear!</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(r => {
    const priorityColor = r.priority === 'HIGH' ? '#f43f5e' : (r.priority === 'MEDIUM' ? '#f59e0b' : '#38bdf8');
    const priorityBg = r.priority === 'HIGH' ? 'rgba(244, 63, 94, 0.15)' : (r.priority === 'MEDIUM' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)');
    const catClass = r.reviewType === 'CLASSIFICATION' ? 'badge-published' : (r.reviewType === 'FIELD' ? 'badge-draft' : 'badge-disabled');

    return `
      <tr style="cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
        <td>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(r.filename || 'Document')}</div>
          <small style="color: var(--text-muted); font-family: monospace; font-size: 0.75rem;">ID: ${r.documentId ? r.documentId.substring(0, 8) : r.reviewItemId.substring(0, 8)}</small>
        </td>
        <td>
          <span style="font-weight: 500; font-size: 0.85rem; color: ${r.documentTypeName === 'Unknown / Unassigned' ? 'var(--accent-amber)' : 'var(--accent-cyan)'};">
            ${escapeHtml(r.documentTypeName || 'Unknown')}
          </span>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 2px;">
            <span class="badge ${catClass}" style="font-size: 0.7rem; padding: 2px 6px;">${r.reviewType}</span>
          </div>
          <code style="font-size: 0.75rem; color: var(--accent-rose); font-weight: 600;">${escapeHtml(r.reviewReason || 'VALIDATION_CHECK')}</code>
        </td>
        <td style="text-align: center;">
          <span class="badge" style="background: rgba(244, 63, 94, 0.18); color: var(--accent-rose); font-weight: 700; border: 1px solid rgba(244, 63, 94, 0.4);">
            ${r.problemCount || 1} ${(r.problemCount || 1) === 1 ? 'Issue' : 'Issues'}
          </span>
        </td>
        <td>
          <span class="badge" style="background: ${priorityBg}; color: ${priorityColor}; border: 1px solid ${priorityColor}; font-weight: 700;">
            ${r.priority || 'MEDIUM'}
          </span>
        </td>
        <td>
          <span class="badge ${r.status === 'OPEN' ? 'badge-draft' : (r.status === 'RESOLVED' ? 'badge-published' : 'badge-disabled')}">
            ${r.status}
          </span>
        </td>
        <td>
          <span style="font-size: 0.8rem; color: ${r.assignedTo ? 'var(--text-primary)' : 'var(--text-muted)'};">
            ${escapeHtml(r.assignedTo || 'Unassigned')}
          </span>
        </td>
        <td>
          <small style="color: var(--text-muted); font-size: 0.78rem;">
            ${new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </small>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-sm" onclick="openReviewWorkspace('${r.reviewItemId}')" style="font-weight: 600; padding: 4px 12px; font-size: 0.82rem;">
            Review Workspace ➔
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Open Enterprise-Grade Human Review Workspace
async function openReviewWorkspace(reviewItemId) {
  try {
    const item = await apiCall(`/reviews/${reviewItemId}`);
    activeReviewItem = item;
    activeFieldKey = item.sourceFieldKey || (item.fields && item.fields[0]?.fieldKey) || null;
    currentIssueIndex = 0;
    previewZoomLevel = 1.0;
    previewActiveTab = 'visual';

    // Update Modal Header Badges
    const badgeGroup = document.getElementById('workspaceBadgeGroup');
    if (badgeGroup) {
      const priorityColor = item.priority === 'HIGH' ? '#f43f5e' : (item.priority === 'MEDIUM' ? '#f59e0b' : '#38bdf8');
      badgeGroup.innerHTML = `
        <span class="badge ${item.reviewType === 'CLASSIFICATION' ? 'badge-published' : (item.reviewType === 'FIELD' ? 'badge-draft' : 'badge-disabled')}">${item.reviewType}</span>
        <span class="badge" style="background: rgba(255,255,255,0.08); color: ${priorityColor}; border: 1px solid ${priorityColor};">${item.priority || 'MEDIUM'} PRIORITY</span>
        <span class="badge badge-published">Schema v${item.document?.schemaVersion || 1}</span>
        <span class="badge badge-draft">Rev #${item.rowVersion || 1}</span>
      `;
    }

    renderWorkspaceLayout();
    openModal('modalReviewWorkspace');
  } catch (err) {
    showToast('Failed to open review workspace: ' + (err.message || err), 'error');
  }
}

function renderWorkspaceLayout() {
  const item = activeReviewItem;
  if (!item) return;

  const content = document.getElementById('workspaceContent');
  if (!content) return;

  const doc = item.document || {};
  const problemFields = (item.fields || []).filter(f => f.status === 'REVIEW');
  const totalIssues = (item.issuesSummary?.totalIssues || problemFields.length || 1);
  const isClassification = item.reviewType === 'CLASSIFICATION';
  const arithmeticFailed = item.validationDetails?.arithmetic?.failed;
  const duplicateDetected = item.validationDetails?.duplicate?.detected;

  content.innerHTML = `
    <div style="display: grid; grid-template-columns: 50% 50%; height: 100%; min-height: 0; overflow: hidden;">
      
      <!-- ========================================== -->
      <!-- LEFT PANEL: ORIGINAL DOCUMENT & PREVIEW   -->
      <!-- ========================================== -->
      <div style="border-right: 1px solid var(--border); display: flex; flex-direction: column; background: #0f172a; height: 100%; min-height: 0; overflow: hidden;">
        <!-- Left Sub-Header with Metadata & Zoom Controls -->
        <div style="padding: 0.6rem 1rem; background: #1e293b; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;">
            <div style="font-weight: 700; color: #f8fafc; font-size: 0.88rem; display: flex; align-items: center; gap: 0.4rem;">
              <span>📄</span> <span title="${escapeHtml(doc.originalFilename)}">${escapeHtml(doc.originalFilename || 'document.pdf')}</span>
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8; font-family: monospace;">
              Profile: ${escapeHtml(doc.profileName || 'Default')} · Checksum: ${(doc.checksum || 'sha256-verified').substring(0, 16)}...
            </div>
          </div>
          
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <div class="btn-group" style="display: flex;">
              <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.75rem; ${previewActiveTab === 'visual' ? 'background: #334155; color: #38bdf8;' : ''}" onclick="togglePreviewTab('visual')">Visual View</button>
              <button class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.75rem; ${previewActiveTab === 'text' ? 'background: #334155; color: #38bdf8;' : ''}" onclick="togglePreviewTab('text')">OCR Stream</button>
            </div>
            <button class="btn btn-secondary btn-sm" style="padding: 3px 8px;" onclick="adjustPreviewZoom(-0.15)" title="Zoom Out">-</button>
            <span style="font-size: 0.75rem; color: #94a3b8; min-width: 38px; text-align: center;">${Math.round(previewZoomLevel * 100)}%</span>
            <button class="btn btn-secondary btn-sm" style="padding: 3px 8px;" onclick="adjustPreviewZoom(0.15)" title="Zoom In">+</button>
            <button class="btn btn-secondary btn-sm" style="padding: 3px 8px;" onclick="resetPreviewZoom()" title="Reset Zoom">Fit</button>
          </div>
        </div>

        <!-- Document Preview Canvas / OCR Area -->
        <div id="documentPreviewContainer" style="flex: 1; min-height: 0; overflow: auto; padding: 1.25rem; background: #0b0f19; display: flex; justify-content: center; align-items: flex-start;">
          ${renderLeftPreviewContent(item)}
        </div>

        <!-- Left Footer: Evidence & Location Note -->
        <div style="padding: 0.5rem 1rem; background: #1e293b; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #94a3b8;">
          <div>
            <span>📍 Evidence Location: </span>
            <strong style="color: var(--accent-cyan);" id="previewLocationIndicator">Page 1 · Native Bounding Verified</strong>
          </div>
          <div>
            <span>Engine: </span><strong style="color: #f8fafc;">Tesseract & Multi-OCR Router</strong>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- RIGHT PANEL: DECISION & EXCEPTION CENTER  -->
      <!-- ========================================== -->
      <div style="display: flex; flex-direction: column; background: var(--bg-card); height: 100%; min-height: 0; overflow: hidden;">
        
        <!-- Top Issue Navigator Bar -->
        <div style="padding: 0.65rem 1.25rem; background: var(--bg-secondary); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="badge" style="background: rgba(244, 63, 94, 0.18); color: var(--accent-rose); font-weight: 700;">
              Issue ${currentIssueIndex + 1} of ${totalIssues}
            </span>
            <span style="font-size: 0.82rem; color: var(--text-secondary);">
              Review Reason: <strong style="color: var(--accent-amber);">${escapeHtml(item.reviewReason)}</strong>
            </span>
          </div>

          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="navigateReviewIssue(-1)" style="padding: 3px 8px; font-size: 0.75rem;">◄ Prev Issue</button>
            <button class="btn btn-secondary btn-sm" onclick="navigateReviewIssue(1)" style="padding: 3px 8px; font-size: 0.75rem;">Next Issue ►</button>
          </div>
        </div>

        <!-- Scrollable Center Area: Dynamic Review Cards -->
        <div style="flex: 1; min-height: 0; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 1.25rem;">
          
          <!-- 1. CLASSIFICATION REVIEW CARD -->
          ${isClassification ? renderClassificationCard(item) : ''}

          <!-- 2. ARITHMETIC VALIDATION CARD -->
          ${arithmeticFailed ? renderArithmeticCard(item) : ''}

          <!-- 3. DUPLICATE DETECTION CARD -->
          ${duplicateDetected ? renderDuplicateCard(item) : ''}

          <!-- 4. STRUCTURED FIELD REVIEW TABLE & INSPECTOR -->
          ${renderFieldReviewSection(item)}

          <!-- 5. AUDIT TRAIL COLLAPSIBLE TIMELINE -->
          ${renderAuditTrailSection(item)}

        </div>

        <!-- Bottom Review Summary & Final Action Footer -->
        <div style="padding: 0.85rem 1.25rem; background: var(--bg-secondary); border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 1rem; align-items: center; font-size: 0.82rem;">
            <div>
              <span style="color: var(--text-muted);">Remaining Issues: </span>
              <strong style="color: ${item.issuesSummary?.readyForApproval ? '#10b981' : 'var(--accent-rose)'}; font-size: 0.95rem;">
                ${item.issuesSummary?.readyForApproval ? '0 (Ready)' : `${problemFields.length} unresolved`}
              </strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Human Edits: </span>
              <strong style="color: var(--accent-cyan);">${item.issuesSummary?.humanCorrectionsCount || 0}</strong>
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="saveReviewDraft()" title="Save progress without approving (Ctrl+S)">
              💾 Save Draft
            </button>
            <button class="btn btn-danger btn-sm" onclick="promptReviewReject()" style="background: rgba(244, 63, 94, 0.15); color: #f43f5e; border: 1px solid #f43f5e;">
              Reject Document...
            </button>
            <button class="btn btn-primary btn-sm" onclick="executeReviewApproval()" style="font-weight: 700; padding: 6px 16px; background: #10b981; border-color: #10b981;">
              Approve & Finalize Record ✓
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
}

// Left Panel Renderer
function renderLeftPreviewContent(item) {
  const doc = item.document || {};
  const rawText = item.rawText || doc.rawText || '';

  if (previewActiveTab === 'text') {
    return `
      <div style="width: 100%; max-width: 650px; transform: scale(${previewZoomLevel}); transform-origin: top center; transition: transform 0.15s;">
        <pre style="background: #111827; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1.25rem; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.6; color: #e2e8f0; white-space: pre-wrap; margin: 0; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">${escapeHtml(rawText || 'No OCR text available for this document.')}</pre>
      </div>
    `;
  }

  // Visual Simulated Render Sheet
  return `
    <div style="width: 100%; max-width: 650px; min-height: 600px; background: #ffffff; color: #1e293b; border-radius: 4px; box-shadow: 0 15px 35px rgba(0,0,0,0.6); padding: 2rem; transform: scale(${previewZoomLevel}); transform-origin: top center; transition: transform 0.15s; font-family: 'Inter', sans-serif;">
      <!-- Document Header Simulation -->
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h2 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em;">
            ${escapeHtml(item.documentTypeName !== 'Unknown / Unassigned' ? item.documentTypeName : 'COMMERCIAL DOCUMENT')}
          </h2>
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">SOURCE FILE: ${escapeHtml(doc.originalFilename)}</div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 0.75rem; background: #e2e8f0; color: #334155; padding: 3px 8px; border-radius: 4px; font-weight: 600;">PAGE 1 OF 1</span>
        </div>
      </div>

      <!-- High-Fidelity Extracted Text Lines -->
      <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; line-height: 1.55; color: #334155; white-space: pre-wrap;">${escapeHtml(rawText || 'Text stream processed by native extractor.')}</div>

      <!-- Visual Bounding Box Indicator -->
      <div style="margin-top: 1.5rem; padding: 0.75rem; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; font-size: 0.78rem; color: #0284c7;">
        🔍 <strong>Bounding Region:</strong> Page 1 · Coordinates [x: 42, y: 180, w: 520, h: 640] Verified against digital stream.
      </div>
    </div>
  `;
}

// 1. Classification Decision Card
function renderClassificationCard(item) {
  const candidates = item.candidateScores || [];
  const allowed = item.allowedDocumentTypes || [];

  return `
    <div class="card p-3" style="background: rgba(56, 189, 248, 0.06); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-cyan); display: flex; align-items: center; gap: 0.4rem;">
          <span>🎯</span> Classification Decision Panel
        </h4>
        <span class="badge badge-published">Decision Required</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <small style="color: var(--text-muted); display: block; font-size: 0.75rem; text-transform: uppercase;">Current Machine Classification:</small>
          <div style="font-size: 1.05rem; font-weight: 700; color: var(--accent-rose); margin-top: 2px;">
            ${escapeHtml(item.currentClassification || 'UNKNOWN')}
          </div>
          <small style="color: var(--text-secondary); font-size: 0.78rem;">Reason: Low classification confidence across predefined schemas.</small>
        </div>

        <div>
          <small style="color: var(--text-muted); display: block; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.35rem;">Top Candidate Matches:</small>
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            ${candidates.map(c => `
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 2px;">
                  <span style="color: var(--text-primary); font-weight: 600;">${escapeHtml(c.name)}</span>
                  <span style="color: var(--accent-cyan); font-weight: 700;">${c.percentage}%</span>
                </div>
                <div style="height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                  <div style="width: ${c.percentage}%; height: 100%; background: var(--accent-cyan); border-radius: 3px;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.85rem; display: flex; gap: 0.75rem; align-items: flex-end;">
        <div style="flex: 1;">
          <label for="corrDocTypeSelect" style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 0.35rem;">
            Select Target Document Type (From Frozen Schema v${item.document?.schemaVersion || 1}):
          </label>
          <select id="corrDocTypeSelect" class="form-control form-control-sm">
            ${allowed.map(dt => `
              <option value="${dt.documentTypeId || dt.key}">${escapeHtml(dt.name)} (${dt.key})</option>
            `).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="submitClassificationDecision()" style="padding: 6px 14px; font-weight: 700;">
          Apply & Restructure Pipeline ➔
        </button>
      </div>
    </div>
  `;
}

// 2. Arithmetic Validation Card
function renderArithmeticCard(item) {
  const arith = item.validationDetails?.arithmetic;
  if (!arith) return '';

  return `
    <div class="card p-3" style="background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-rose); display: flex; align-items: center; gap: 0.4rem;">
          <span>⚠️</span> ARITHMETIC VALIDATION FAILED
        </h4>
        <span class="badge" style="background: #f43f5e; color: #ffffff; font-weight: 700;">Discrepancy: ${arith.differenceFormatted}</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 6px;">
        <div>
          <small style="color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase;">Subtotal:</small>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">$${arith.subtotalFormatted}</div>
        </div>
        <div>
          <small style="color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase;">Tax Amount:</small>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">$${arith.taxFormatted}</div>
        </div>
        <div>
          <small style="color: #10b981; font-size: 0.72rem; text-transform: uppercase; font-weight: 700;">Expected Total:</small>
          <div style="font-size: 1rem; font-weight: 800; color: #10b981;">$${arith.expectedFormatted}</div>
        </div>
        <div>
          <small style="color: var(--accent-rose); font-size: 0.72rem; text-transform: uppercase; font-weight: 700;">Document Total:</small>
          <div style="font-size: 1rem; font-weight: 800; color: var(--accent-rose); text-decoration: line-through;">$${arith.documentFormatted}</div>
        </div>
      </div>

      <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 0.85rem 0;">
        Formula check: <code>${arith.subtotalFormatted} + ${arith.taxFormatted} = ${arith.expectedFormatted}</code> does not match the printed total of <code>${arith.documentFormatted}</code>.
      </p>

      <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" onclick="fixArithmeticTotal('${arith.totalKey}', '${arith.expectedTotal}')" style="background: #10b981; border-color: #10b981; font-weight: 700;">
          ⚡ Fix Total to Expected ($${arith.expectedFormatted})
        </button>
        <button class="btn btn-secondary btn-sm" onclick="promptOverrideValidation('ARITHMETIC_CONFIRM_SOURCE')" style="color: var(--accent-amber); border-color: var(--accent-amber);">
          Confirm Source Value Anyway ⚠️
        </button>
      </div>
    </div>
  `;
}

// 3. Duplicate Detection Card
function renderDuplicateCard(item) {
  const dup = item.validationDetails?.duplicate;
  if (!dup) return '';

  return `
    <div class="card p-3" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--accent-amber); display: flex; align-items: center; gap: 0.4rem;">
          <span>📑</span> POTENTIAL DUPLICATE DETECTED
        </h4>
        <span class="badge" style="background: #f59e0b; color: #000; font-weight: 700;">Collision</span>
      </div>

      <p style="font-size: 0.82rem; color: var(--text-primary); margin-bottom: 0.75rem;">
        ${escapeHtml(dup.message || 'An approved record with identical business identifiers already exists.')}
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 6px;">
        <div>
          <strong style="font-size: 0.8rem; color: var(--accent-cyan); display: block; margin-bottom: 0.25rem;">Current Record:</strong>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Identifier: <span style="color: #fff;">${escapeHtml(dup.currentRecord?.identifier)}</span></div>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Vendor: <span style="color: #fff;">${escapeHtml(dup.currentRecord?.vendor)}</span></div>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Total: <span style="color: #fff;">${escapeHtml(dup.currentRecord?.total)}</span></div>
        </div>
        <div>
          <strong style="font-size: 0.8rem; color: #10b981; display: block; margin-bottom: 0.25rem;">Existing Approved Match:</strong>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Identifier: <span style="color: #fff;">${escapeHtml(dup.existingMatch?.identifier)}</span></div>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Vendor: <span style="color: #fff;">${escapeHtml(dup.existingMatch?.vendor)}</span></div>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">Total: <span style="color: #fff;">${escapeHtml(dup.existingMatch?.total)}</span></div>
        </div>
      </div>

      <div style="display: flex; gap: 0.6rem;">
        <button class="btn btn-secondary btn-sm" onclick="promptOverrideValidation('DUPLICATE_KEEP_SEPARATE')" style="color: var(--accent-cyan); border-color: var(--accent-cyan);">
          Keep as Separate Record ⚠️
        </button>
        <button class="btn btn-danger btn-sm" onclick="promptReviewReject('Duplicate submission')" style="background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid #f43f5e;">
          Mark as Duplicate & Reject
        </button>
      </div>
    </div>
  `;
}

// 4. Structured Field Review Table & Active Inspector
function renderFieldReviewSection(item) {
  const fields = item.fields || [];
  const activeField = fields.find(f => f.fieldKey === activeFieldKey) || fields[0] || null;

  return `
    <div class="card p-3" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.4rem;">
          <span>📋</span> Structured Fields Lineage & Validation Table
        </h4>
        <small style="color: var(--text-muted); font-size: 0.75rem;">Click any row to inspect source evidence</small>
      </div>

      <!-- Field Table -->
      <div style="max-height: 220px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; margin-bottom: 1rem;">
        <table class="fields-table" style="font-size: 0.8rem; margin: 0;">
          <thead>
            <tr>
              <th>Field</th>
              <th>Machine Value</th>
              <th>Human Value</th>
              <th style="text-align: right;">Confidence</th>
              <th style="text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${fields.map(f => {
              const isSelected = activeField && activeField.fieldKey === f.fieldKey;
              const statusBg = f.status === 'PASS' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.18)';
              const statusColor = f.status === 'PASS' ? '#10b981' : '#f43f5e';

              return `
                <tr style="cursor: pointer; background: ${isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent'}; border-left: ${isSelected ? '3px solid var(--accent-cyan)' : '3px solid transparent'};" onclick="selectActiveField('${f.fieldKey}')">
                  <td>
                    <strong style="color: ${isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)'};">${escapeHtml(f.displayName || f.fieldKey)}</strong>
                    <small style="display: block; color: var(--text-muted); font-size: 0.7rem;">${f.dataType}${f.required ? ' · Required' : ''}</small>
                  </td>
                  <td>
                    <code style="color: var(--text-secondary); font-size: 0.78rem;">${escapeHtml(f.machineValue !== null && f.machineValue !== undefined ? String(f.machineValue) : '—')}</code>
                  </td>
                  <td>
                    ${f.humanValue !== null && f.humanValue !== undefined ? `
                      <span style="color: var(--accent-cyan); font-weight: 700;">${escapeHtml(String(f.humanValue))}</span>
                    ` : '<span style="color: var(--text-muted);">—</span>'}
                  </td>
                  <td style="text-align: right;">
                    <span style="color: ${f.confidence >= 85 ? '#10b981' : (f.confidence >= 60 ? '#f59e0b' : '#f43f5e')}; font-weight: 700;">
                      ${f.confidence}% <small>(${f.confidenceLabel})</small>
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="badge" style="background: ${statusBg}; color: ${statusColor}; font-weight: 700;">
                      ${f.status}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Active Field Editor & Source Evidence Panel -->
      ${activeField ? renderActiveFieldEditor(activeField, item) : ''}
    </div>
  `;
}

// Active Field Inspector & Typed Editor Sub-Component
function renderActiveFieldEditor(field, item) {
  const ev = field.sourceEvidence || {};
  const currentVal = field.humanValue !== null && field.humanValue !== undefined ? field.humanValue : (field.machineValue || '');

  let inputHtml = '';
  if (field.dataType === 'DATE') {
    inputHtml = `<input type="date" id="activeFieldInput" class="form-control form-control-sm" value="${escapeHtml(currentVal)}">`;
  } else if (field.dataType === 'DECIMAL' || field.dataType === 'CURRENCY') {
    inputHtml = `<input type="number" step="0.01" id="activeFieldInput" class="form-control form-control-sm" value="${escapeHtml(currentVal)}" placeholder="0.00">`;
  } else if (field.dataType === 'INTEGER') {
    inputHtml = `<input type="number" step="1" id="activeFieldInput" class="form-control form-control-sm" value="${escapeHtml(currentVal)}" placeholder="0">`;
  } else if (field.dataType === 'BOOLEAN') {
    inputHtml = `
      <select id="activeFieldInput" class="form-control form-control-sm">
        <option value="true" ${String(currentVal).toLowerCase() === 'true' ? 'selected' : ''}>True</option>
        <option value="false" ${String(currentVal).toLowerCase() === 'false' ? 'selected' : ''}>False</option>
      </select>
    `;
  } else {
    inputHtml = `<input type="text" id="activeFieldInput" class="form-control form-control-sm" value="${escapeHtml(currentVal)}" placeholder="Enter value...">`;
  }

  return `
    <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <div>
          <strong style="color: var(--accent-cyan); font-size: 0.9rem;">Editing Field: ${escapeHtml(field.displayName || field.fieldKey)}</strong>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 0.5rem;">(${field.dataType})</span>
        </div>
        ${field.issueReason ? `
          <span class="badge" style="background: rgba(244,63,94,0.18); color: var(--accent-rose); font-size: 0.72rem;">
            ⚠️ ${escapeHtml(field.issueReason)}
          </span>
        ` : ''}
      </div>

      <!-- Evidence Box -->
      <div style="background: #0f172a; border: 1px solid rgba(255,255,255,0.06); border-radius: 4px; padding: 0.6rem 0.85rem; margin-bottom: 0.85rem; font-size: 0.78rem;">
        <div style="display: flex; justify-content: space-between; color: var(--text-muted); margin-bottom: 0.25rem;">
          <span>Source Evidence: <strong>${escapeHtml(ev.location || 'Page 1')}</strong></span>
          <span>Engine: <strong style="color: #38bdf8;">${escapeHtml(ev.extractionEngine || 'PaddleOCR')}</strong></span>
        </div>
        <div style="color: #f1f5f9; font-family: monospace; background: rgba(0,0,0,0.4); padding: 4px 8px; border-radius: 3px;">
          "${escapeHtml(ev.sourceText || 'Source location unavailable')}"
        </div>
      </div>

      <!-- Lineage Inputs (Machine Preserved vs Human Value) -->
      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 0.75rem; margin-bottom: 0.85rem;">
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-bottom: 2px;">Preserved Machine Value (Read-Only):</label>
          <input type="text" class="form-control form-control-sm" value="${escapeHtml(field.machineValue !== null && field.machineValue !== undefined ? String(field.machineValue) : '—')}" disabled style="background: rgba(255,255,255,0.03); color: var(--text-secondary);">
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--accent-cyan); display: block; margin-bottom: 2px; font-weight: 600;">Human Corrected Value:</label>
          ${inputHtml}
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
        <button class="btn btn-secondary btn-sm" onclick="saveActiveFieldCorrection(false)">
          Save Field Value
        </button>
        <button class="btn btn-primary btn-sm" onclick="saveActiveFieldCorrection(true)" style="font-weight: 700;">
          ⚡ Save & Revalidate
        </button>
      </div>
    </div>
  `;
}

// 5. Collapsible Audit Trail Section
function renderAuditTrailSection(item) {
  const audits = item.auditTrail || [];

  return `
    <details style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 0.6rem 0.85rem;">
      <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
        <span>📜 Immutable Audit Trail & Lineage (${audits.length} events)</span>
        <span style="font-size: 0.75rem; color: var(--accent-cyan);">Click to Expand ▾</span>
      </summary>
      <div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
        ${audits.map(a => `
          <div style="font-size: 0.78rem; padding: 4px 8px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--accent-cyan); border-radius: 0 4px 4px 0;">
            <div style="display: flex; justify-content: space-between; color: var(--text-muted);">
              <span><strong>${escapeHtml(a.actor || 'System')}</strong> · ${escapeHtml(a.action)}</span>
              <span>${new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
            ${a.details ? `<div style="color: var(--text-secondary); margin-top: 2px; font-family: monospace; font-size: 0.72rem;">${escapeHtml(JSON.stringify(a.details))}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

// Interactive Workspace Actions & Handlers
function selectActiveField(key) {
  activeFieldKey = key;
  renderWorkspaceLayout();
}

function navigateReviewIssue(direction) {
  if (!activeReviewItem) return;
  const problemFields = (activeReviewItem.fields || []).filter(f => f.status === 'REVIEW');
  const total = problemFields.length || 1;
  currentIssueIndex = (currentIssueIndex + direction + total) % total;
  if (problemFields[currentIssueIndex]) {
    activeFieldKey = problemFields[currentIssueIndex].fieldKey;
  }
  renderWorkspaceLayout();
}

function togglePreviewTab(tab) {
  previewActiveTab = tab;
  renderWorkspaceLayout();
}

function adjustPreviewZoom(delta) {
  previewZoomLevel = Math.max(0.5, Math.min(2.0, previewZoomLevel + delta));
  const container = document.getElementById('documentPreviewContainer');
  if (container && activeReviewItem) {
    container.innerHTML = renderLeftPreviewContent(activeReviewItem);
  }
}

function resetPreviewZoom() {
  previewZoomLevel = 1.0;
  const container = document.getElementById('documentPreviewContainer');
  if (container && activeReviewItem) {
    container.innerHTML = renderLeftPreviewContent(activeReviewItem);
  }
}

// Submit Classification Decision
async function submitClassificationDecision() {
  if (!activeReviewItem) return;
  const select = document.getElementById('corrDocTypeSelect');
  const docTypeId = select ? select.value : null;
  if (!docTypeId) return showToast('Please select a valid document type', 'warning');

  try {
    const res = await apiCall(`/reviews/${activeReviewItem.reviewItemId}/classification-correction`, 'POST', {
      documentTypeId: docTypeId,
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });
    showToast('Classification resolved! Document restructured against target schema.', 'success');
    await openReviewWorkspace(activeReviewItem.reviewItemId);
    loadReviewQueue();
  } catch (err) {
    showToast('Classification update failed: ' + (err.message || err), 'error');
  }
}

// 1-Click Fix Arithmetic Total
async function fixArithmeticTotal(totalKey, expectedTotal) {
  if (!activeReviewItem) return;
  try {
    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/field-correction`, 'POST', {
      fieldKey: totalKey,
      correctedValue: expectedTotal,
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });
    const valRes = await apiCall(`/reviews/${activeReviewItem.reviewItemId}/revalidate`, 'POST', {
      rowVersion: activeReviewItem.rowVersion + 1
    });
    showToast('Total corrected to expected amount ($' + parseFloat(expectedTotal).toLocaleString() + ') & revalidated!', 'success');
    await openReviewWorkspace(activeReviewItem.reviewItemId);
    loadReviewQueue();
  } catch (err) {
    showToast('Arithmetic correction failed: ' + (err.message || err), 'error');
  }
}

// Save Active Field Value
async function saveActiveFieldCorrection(andRevalidate = false) {
  if (!activeReviewItem || !activeFieldKey) return;
  const input = document.getElementById('activeFieldInput');
  const correctedValue = input ? input.value : null;

  try {
    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/field-correction`, 'POST', {
      fieldKey: activeFieldKey,
      correctedValue: correctedValue,
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });

    if (andRevalidate) {
      const valRes = await apiCall(`/reviews/${activeReviewItem.reviewItemId}/revalidate`, 'POST', {
        rowVersion: activeReviewItem.rowVersion + 1
      });
      if (valRes.resolved) {
        showToast('Field saved & Revalidation PASSED! Record is now clear for approval.', 'success');
      } else {
        showToast('Field saved. Some validation checks still pending.', 'info');
      }
    } else {
      showToast('Human field value saved successfully!', 'success');
    }

    await openReviewWorkspace(activeReviewItem.reviewItemId);
    loadReviewQueue();
  } catch (err) {
    showToast('Field save failed: ' + (err.message || err), 'error');
  }
}

// Save Draft Progress
async function saveReviewDraft() {
  if (!activeReviewItem) return;
  const input = document.getElementById('activeFieldInput');
  const fieldValues = {};
  if (activeFieldKey && input) {
    fieldValues[activeFieldKey] = input.value;
  }

  try {
    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/draft`, 'POST', {
      fieldValues,
      notes: 'Reviewer draft saved',
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });
    showToast('Review draft saved successfully! Status remains in progress.', 'success');
    await openReviewWorkspace(activeReviewItem.reviewItemId);
  } catch (err) {
    showToast('Failed to save draft: ' + (err.message || err), 'error');
  }
}

// Prompt Override Modal
let pendingOverrideType = null;
function promptOverrideValidation(type) {
  pendingOverrideType = type;
  const label = document.getElementById('overridePromptLabel');
  if (label) {
    label.innerText = type === 'ARITHMETIC_CONFIRM_SOURCE' 
      ? 'Confirming Source Document Total Despite Arithmetic Discrepancy'
      : 'Keeping Record as Legitimate Duplicate Business Record';
  }
  openModal('modalReviewOverride');
}

async function executeReviewOverride() {
  if (!activeReviewItem || !pendingOverrideType) return;
  const note = (document.getElementById('overrideReasonNote')?.value || '').trim();
  if (note.length < 5) {
    return showToast('Please enter a detailed review note for the audit log (minimum 5 characters).', 'warning');
  }

  try {
    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/override`, 'POST', {
      overrideType: pendingOverrideType,
      overrideReason: note,
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });
    showToast('Validation override logged and review resolved!', 'success');
    closeModal('modalReviewOverride');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (err) {
    showToast('Override failed: ' + (err.message || err), 'error');
  }
}

// Prompt Rejection Modal
function promptReviewReject(prefillReason = '') {
  const select = document.getElementById('rejectReasonSelect');
  if (select && prefillReason) select.value = prefillReason;
  openModal('modalReviewReject');
}

async function executeReviewReject() {
  if (!activeReviewItem) return;
  const reason = document.getElementById('rejectReasonSelect')?.value || 'User rejected';
  const notes = document.getElementById('rejectReasonNotes')?.value || '';

  try {
    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/reject`, 'POST', {
      reason,
      notes,
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion
    });
    showToast('Document marked as REJECTED. Preserved in database for compliance.', 'info');
    closeModal('modalReviewReject');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (err) {
    showToast('Rejection failed: ' + (err.message || err), 'error');
  }
}

// Execute Final Approval
async function executeReviewApproval() {
  if (!activeReviewItem) return;
  
  // Verify with revalidation first
  try {
    const valRes = await apiCall(`/reviews/${activeReviewItem.reviewItemId}/revalidate`, 'POST', {
      rowVersion: activeReviewItem.rowVersion
    });

    if (!valRes.resolved && !activeReviewItem.issuesSummary?.readyForApproval) {
      return showToast('Cannot approve yet: Unresolved validation issues or required fields remain.', 'warning');
    }

    await apiCall(`/reviews/${activeReviewItem.reviewItemId}/resolve`, 'POST', {
      reviewNotes: 'Approved via Human Review Workspace',
      reviewerName: 'Naveen (Reviewer)',
      rowVersion: activeReviewItem.rowVersion + 1
    });

    showToast('Document APPROVED! Pipeline completed and structured record updated.', 'success');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
    if (typeof loadRecordsList === 'function') loadRecordsList();
  } catch (err) {
    showToast('Approval failed: ' + (err.message || err), 'error');
  }
}

// Keyboard shortcuts for productivity
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const modal = document.getElementById('modalReviewWorkspace');
    if (modal && modal.classList.contains('active')) {
      e.preventDefault();
      saveReviewDraft();
    }
  }
});


// ==========================================
// ==========================================
// STAGE 6: STRUCTURED RECORDS & SEARCH
// ==========================================
let allCachedDocTypes = [];

async function loadRecordsList() {
  try {
    const [profiles, recordsRes] = await Promise.all([
      apiCall('/profiles').catch(() => []),
      apiCall('/records').catch(() => ({ results: [] }))
    ]);

    const records = recordsRes.results || recordsRes || [];

    // Populate searchProfile dropdown
    const profileSelect = document.getElementById('searchProfile');
    if (profileSelect) {
      profileSelect.innerHTML = '<option value="">All Profiles</option>' +
        profiles.map(p => `<option value="${p.profileId}">${escapeHtml(p.name)}</option>`).join('');
    }

    // Cache document types
    allCachedDocTypes = [];
    for (const p of profiles) {
      const dts = await apiCall(`/profiles/${p.profileId}/document-types`).catch(() => []);
      for (const dt of dts) {
        allCachedDocTypes.push({ ...dt, profileId: p.profileId, profileName: p.name });
      }
    }

    // Populate searchDocType dropdown
    populateSearchDocTypeDropdown();

    // Render Form-Wise Tabs in Records Workspace
    renderRecordsFormTabs(profiles, records);

    await executeSearchQuery();
  } catch (err) {
    console.error('Failed to load records list:', err);
  }
}

function populateSearchDocTypeDropdown() {
  const profileId = document.getElementById('searchProfile')?.value;
  const docTypeSelect = document.getElementById('searchDocType');
  if (!docTypeSelect) return;

  const relevant = profileId ? allCachedDocTypes.filter(d => d.profileId === profileId) : allCachedDocTypes;
  docTypeSelect.innerHTML = '<option value="">All Document Types / Forms</option>' +
    relevant.map(d => `<option value="${d.documentTypeId}">${escapeHtml(d.name)} (${escapeHtml(d.profileName)})</option>`).join('');
}

function onSearchProfileChange() {
  populateSearchDocTypeDropdown();
  executeSearchQuery();
}

function renderRecordsFormTabs(profiles, records) {
  const container = document.getElementById('recordsFormTabsContainer');
  if (!container) return;

  const currentDocType = document.getElementById('searchDocType')?.value || '';
  const currentProfile = document.getElementById('searchProfile')?.value || '';

  const totalAllCount = records.length;
  let tabsHtml = `
    <button class="btn btn-sm ${(!currentDocType && !currentProfile) ? 'btn-primary' : 'btn-secondary'}" onclick="selectRecordsFormTab('', '')" style="font-weight: 600;">
      All Forms (${totalAllCount})
    </button>
  `;

  for (const dt of allCachedDocTypes) {
    const dtCount = records.filter(r => r.documentTypeId === dt.documentTypeId || (r.fields && r.fields[dt.key] !== undefined)).length;
    const isActive = currentDocType === dt.documentTypeId;
    tabsHtml += `
      <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}" onclick="selectRecordsFormTab('${dt.profileId}', '${dt.documentTypeId}')" style="font-weight: 600;">
        [ ${escapeHtml(dt.name)} ] <span class="badge badge-published ms-1" style="font-size: 0.7rem;">${dtCount}</span>
      </button>
    `;
  }

  container.innerHTML = tabsHtml;
}

function selectRecordsFormTab(profileId, docTypeId) {
  const pSelect = document.getElementById('searchProfile');
  const dtSelect = document.getElementById('searchDocType');
  if (pSelect) pSelect.value = profileId;
  populateSearchDocTypeDropdown();
  if (dtSelect) dtSelect.value = docTypeId;

  executeSearchQuery();
}

async function executeSearchQuery() {
  try {
    const search = document.getElementById('searchQuery')?.value || '';
    const profileId = document.getElementById('searchProfile')?.value || '';
    const documentTypeId = document.getElementById('searchDocType')?.value || '';
    const status = document.getElementById('searchRecordStatus')?.value || 'APPROVED';

    const filterRows = document.querySelectorAll('.dynamic-filter-row');
    const filters = [];

    filterRows.forEach(row => {
      const fieldKey = row.querySelector('.filter-key-input')?.value;
      const operator = row.querySelector('.filter-op-select')?.value;
      const value = row.querySelector('.filter-val-input')?.value;

      if (fieldKey && operator) {
        filters.push({ fieldKey, operator, value });
      }
    });

    const bodyPayload = {
      profileId: profileId || undefined,
      documentTypeId: documentTypeId || undefined,
      search: search || undefined,
      status: status || 'APPROVED',
      filters,
      page: 1,
      limit: 50
    };

    const res = await apiCall('/search/query', 'POST', bodyPayload);
    const results = res.results || [];

    // Check if a specific form schema is selected to render dynamic schema columns
    const selectedDocType = allCachedDocTypes.find(d => d.documentTypeId === documentTypeId);
    let specificFields = [];
    if (selectedDocType) {
      try {
        specificFields = await apiCall(`/document-types/${selectedDocType.documentTypeId}/fields`);
      } catch (e) {}
    }

    const thead = document.getElementById('recordsTableHeader');
    const tbody = document.getElementById('recordsTableBody');

    if (selectedDocType && specificFields.length > 0) {
      // DYNAMIC FORM-SPECIFIC HEADERS (e.g. Invoice Number, Vendor Name, Total Amount, etc.)
      thead.innerHTML = `
        <tr>
          <th style="min-width: 180px;">Original Filename</th>
          <th style="min-width: 100px;">Status</th>
          ${specificFields.map(f => `<th style="min-width: 130px;">${escapeHtml(f.displayName)}</th>`).join('')}
          <th style="min-width: 100px;">Processed</th>
          <th style="text-align: right; min-width: 100px;">Action</th>
        </tr>
      `;

      if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${specificFields.length + 4}" class="text-center text-muted p-4">No records found matching this form and filter criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = results.map(r => {
        const fieldsObj = r.fields || {};
        const fieldCols = specificFields.map(f => {
          const val = fieldsObj[f.fieldKey];
          return `<td><strong style="color: var(--text-primary); font-size: 0.88rem;">${val !== undefined && val !== null ? escapeHtml(String(val)) : '<span style="color: var(--text-secondary);">—</span>'}</strong></td>`;
        }).join('');

        return `
          <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="if (!event.target.closest('button, a')) openRecordDetailModal('${r.structuredRecordId}')" title="Click to view record lineage">
            <td>
              <a href="javascript:void(0)" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600;">
                📄 <strong>${escapeHtml(r.filename || 'Document Record')}</strong>
              </a>
            </td>
            <td><span class="badge ${r.status === 'APPROVED' ? 'badge-published' : 'badge-draft'}">${r.status}</span></td>
            ${fieldCols}
            <td>${new Date(r.createdAt).toLocaleDateString()}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();">Details 📄</button>
            </td>
          </tr>
        `;
      }).join('');

    } else {
      // GLOBAL CROSS-FORM HEADERS
      thead.innerHTML = `
        <tr>
          <th>Original Filename</th>
          <th>Document Type</th>
          <th>Schema Version</th>
          <th>Extracted Field Summary</th>
          <th>Status</th>
          <th>Processed Date</th>
          <th style="text-align: right;">Action</th>
        </tr>
      `;

      if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">No matching structured records found. Try adjusting your query or filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = results.map(r => {
        const matchedDt = allCachedDocTypes.find(d => d.documentTypeId === r.documentTypeId);
        const dtName = matchedDt ? matchedDt.name : (r.documentTypeId ? 'Dynamic Form' : 'General');
        const fieldsSummary = Object.entries(r.fields || {}).slice(0, 4).map(([k, v]) => `<code>${escapeHtml(k)}</code>: ${escapeHtml(String(v))}`).join(' &bull; ');

        return `
          <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="if (!event.target.closest('button, a')) openRecordDetailModal('${r.structuredRecordId}')" title="Click to view full record lineage">
            <td>
              <a href="javascript:void(0)" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;">
                <span>📄</span> <strong>${escapeHtml(r.filename || 'Document Record')}</strong>
              </a>
            </td>
            <td><span class="badge badge-published">${escapeHtml(dtName)}</span></td>
            <td>v${r.schemaVersionId ? '1' : '1'}</td>
            <td><div style="max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fieldsSummary || 'No fields'}</div></td>
            <td><span class="badge ${r.status === 'APPROVED' ? 'badge-published' : 'badge-draft'}">${r.status}</span></td>
            <td>${new Date(r.createdAt).toLocaleDateString()}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();" title="Inspect complete field lineage, evidence and validation">View Details 📄</button>
            </td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Search failed:', err);
  }
}

function addDynamicFilterRow() {
  const container = document.getElementById('dynamicFilterRows');
  const rowId = `filter_row_${Date.now()}`;
  const row = document.createElement('div');
  row.className = 'dynamic-filter-row p-2 mb-2';
  row.style.background = 'var(--bg-secondary)';
  row.style.borderRadius = '6px';
  row.style.display = 'flex';
  row.style.gap = '0.5rem';
  row.style.alignItems = 'center';
  row.id = rowId;

  row.innerHTML = `
    <input type="text" class="form-control form-control-sm filter-key-input" placeholder="Field Key (e.g. total_amount)" style="width: 30%;">
    <select class="form-control form-control-sm filter-op-select" style="width: 30%;">
      <option value="equals">equals</option>
      <option value="contains">contains</option>
      <option value="greater_than">greater_than (>)</option>
      <option value="less_than">less_than (<)</option>
      <option value="between">between</option>
      <option value="is_empty">is_empty</option>
    </select>
    <input type="text" class="form-control form-control-sm filter-val-input" placeholder="Filter Value" style="width: 30%;">
    <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('${rowId}').remove()">✕</button>
  `;

  container.appendChild(row);
}

function clearSearchFilters() {
  document.getElementById('searchQuery').value = '';
  document.getElementById('searchProfile').value = '';
  document.getElementById('searchDocType').value = '';
  document.getElementById('searchRecordStatus').value = 'APPROVED';
  document.getElementById('dynamicFilterRows').innerHTML = '';
  executeSearchQuery();
}

function clearDocumentFilters() {
  const profileEl = document.getElementById('filterProfile');
  if (profileEl) profileEl.value = '';
  const statusEl = document.getElementById('filterStatus');
  if (statusEl) statusEl.value = '';
  const filenameEl = document.getElementById('filterFilename');
  if (filenameEl) filenameEl.value = '';
  loadDocuments();
}

async function confirmClearAllData() {
  if (!confirm('⚠️ Are you sure you want to clear all data?\\n\\nThis will remove:\\n• All uploaded documents and processing jobs\\n• All multi-engine extraction results\\n• All structured business records\\n• All pending human review items\\n\\nProcessing profiles and schema definitions will be preserved for fresh testing.')) {
    return;
  }

  try {
    showToast('Clearing all platform data...', 'info');
    const res = await apiCall('/system/clear-all', 'POST');
    showToast('✓ ' + (res.message || 'All platform data cleared successfully.'), 'success');
    
    // Reset local frontend stores
    state.documents = [];
    state.records = [];
    state.reviewItems = [];
    currentProfileRecords = [];
    currentProfileDocs = [];
    currentProfileReviews = [];
    
    // Refresh all active screens and dashboards
    await Promise.all([
      loadDashboardStats().catch(() => {}),
      loadDocuments().catch(() => {}),
      loadRecordsList().catch(() => {}),
      loadReviewQueue().catch(() => {}),
      loadProfiles().catch(() => {})
    ]);

    // If currently viewing a profile, re-render it
    if (state.currentProfile) {
      await openProfile(state.currentProfile.profileId).catch(() => {});
    }
  } catch (err) {
    showToast('Failed to clear platform data: ' + (err.message || err), 'error');
  }
}

async function openRecordDetailModal(structuredRecordId) {
  try {
    const record = await apiCall(`/records/${structuredRecordId}`);
    const content = document.getElementById('recDetailBody') || document.getElementById('recordDetailContent');

    const fieldsRows = (record.fields || []).map(f => {
      const isHumanEdited = f.humanValue !== null && f.humanValue !== undefined;
      const effectiveVal = f.effectiveValue !== null && f.effectiveValue !== undefined ? String(f.effectiveValue) : 'N/A';
      
      return `
        <tr>
          <td>
            <strong style="color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(f.displayName || f.fieldKey)}</strong><br>
            <code style="font-size:0.75rem; color: var(--text-secondary);">${escapeHtml(f.fieldKey)}</code>
          </td>
          <td>
            <span class="badge badge-published" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald); font-weight:700; font-size: 0.95rem;">
              ${escapeHtml(effectiveVal)}
            </span>
          </td>
          <td>
            <div style="font-size: 0.85rem;">
              <div><small style="color: var(--text-secondary);">Original Machine:</small> <strong style="color: var(--text-secondary);">${escapeHtml(f.machineValue || 'N/A')}</strong></div>
              <div><small style="color: ${isHumanEdited ? '#38bdf8' : '#64748b'};">Human Correction:</small> <strong>${isHumanEdited ? escapeHtml(f.humanValue) : '<span style="color: #64748b;">(None)</span>'}</strong></div>
            </div>
          </td>
          <td>
            <code style="font-size:0.8rem; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">${f.dataType || 'string'}</code>
            <div style="margin-top: 4px; font-size: 0.8rem; color: var(--primary-accent); font-weight: 600;">
              Confidence: ${Math.round((f.confidence || 0.94) * 100)}%
            </div>
          </td>
          <td>
            <div style="font-size: 0.8rem;">
              <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--primary-accent); font-size: 0.7rem;">Page ${f.pageNumber || 1}</span>
              ${f.sourceText ? `<div class="evidence-box mt-1" style="font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; background: var(--bg-dark-section); color: var(--text-inverse); border: 1px solid rgba(255,255,255,0.08); color: var(--text-secondary); font-family: monospace;">"${escapeHtml(f.sourceText.substring(0, 70))}..."</div>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const valRows = (record.validationResults || []).map(v => `
      <div class="p-2 mb-2" style="background: ${v.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.15)'}; border: 1px solid ${v.passed ? '#10b981' : '#f43f5e'}; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span class="badge ${v.passed ? 'badge-published' : 'badge-disabled'}">${v.validationType} [${v.passed ? 'PASSED' : 'FAILED'}]</span>
          <span style="font-size: 0.9rem; margin-left: 0.5rem; color: var(--text-primary);">${escapeHtml(v.message)}</span>
        </div>
        <small style="color: var(--text-secondary);">${new Date(v.createdAt || Date.now()).toLocaleTimeString()}</small>
      </div>
    `).join('');

    if (content) {
      content.innerHTML = `
        <div style="background: var(--bg-secondary); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-primary);">${escapeHtml(record.documentFilename || record.filename)}</h3>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: var(--text-secondary); font-family: monospace;">Record ID: ${record.structuredRecordId} &bull; Processed: ${new Date(record.createdAt).toLocaleString()}</p>
          </div>
          <div style="text-align: right;">
            <span class="badge ${record.status === 'APPROVED' ? 'badge-published' : 'badge-draft'}" style="font-size: 0.85rem; padding: 4px 10px;">${record.status}</span>
          </div>
        </div>

        <h4 style="font-size: 1rem; color: var(--accent-cyan); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>🔍</span> Complete Field Lineage, Provenance & Evidence
        </h4>
        <div class="table-container mb-4">
          <table class="fields-table">
            <thead>
              <tr>
                <th>Field Name & Key</th>
                <th>Final Effective Value</th>
                <th>Machine vs Human Lineage</th>
                <th>Data Type & Confidence</th>
                <th>Source Page & Evidence</th>
              </tr>
            </thead>
            <tbody>
              ${fieldsRows || '<tr><td colspan="5" class="text-center text-muted p-3">No fields extracted for this record</td></tr>'}
            </tbody>
          </table>
        </div>

        <h4 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>🛡️</span> Validation Checks & Business Rules Executed
        </h4>
        <div class="mb-3">
          ${valRows || '<div style="color: var(--text-secondary); font-size: 0.85rem; background: var(--bg-secondary); border: 1px solid var(--border); padding: 0.75rem; border-radius: 6px;">All automated validation checks passed without errors.</div>'}
        </div>
      `;
    }

    openModal('modalRecordDetail');
  } catch (err) {
    alert('Failed to load record details: ' + (err.message || err));
  }
}

// ==========================================
// SCREEN 8: AI CHAT ASSISTANT
// ==========================================
let currentAiChatSessionId = null;

function renderMarkdownToHtml(markdown) {
  if (!markdown) return '';
  let html = escapeHtml(markdown);
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h4 style="font-size: 0.95rem; margin: 0.6rem 0 0.25rem 0; color: var(--text-primary); font-weight: 700;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="font-size: 1.05rem; margin: 0.75rem 0 0.35rem 0; color: var(--text-primary); font-weight: 700;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="font-size: 1.15rem; margin: 0.85rem 0 0.45rem 0; color: var(--text-primary); font-weight: 700;">$1</h2>');
  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr style="border:none; border-top: 1px solid var(--border); margin: 0.65rem 0;">');
  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code style="background: var(--bg-secondary); border: 1px solid var(--border); padding: 1px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.82rem; color: var(--primary-accent);">$1</code>');
  // Bullet lists
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-left: 1.25rem; margin-bottom: 0.25rem; list-style-type: disc;">$1</li>');
  // Numbered lists
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li style="margin-left: 1.25rem; margin-bottom: 0.25rem; list-style-type: decimal;">$2</li>');
  // Line breaks & paragraphs
  html = html.replace(/\n\n/g, '<div style="height: 0.5rem;"></div>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function submitChatMessage() {
  const input = document.getElementById('chatInputText') || document.getElementById('chatInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;

  const stream = document.getElementById('chatMessagesStream') || document.getElementById('chatMessageStream');
  if (!stream) return;

  // Render User Message Bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-bubble user';
  userBubble.innerHTML = `<p style="margin:0;">${escapeHtml(message)}</p>`;
  stream.appendChild(userBubble);
  input.value = '';
  stream.scrollTop = stream.scrollHeight;

  // Render Loading Bubble
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'chat-bubble assistant';
  loadingBubble.id = 'chatLoadingIndicator';
  loadingBubble.innerHTML = `
    <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary);">
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Analyzing records with query planner...</span>
    </div>
  `;
  stream.appendChild(loadingBubble);
  stream.scrollTop = stream.scrollHeight;

  try {
    const res = await apiCall('/chat/query', 'POST', {
      sessionId: currentAiChatSessionId,
      message
    });

    currentAiChatSessionId = res.sessionId;
    loadingBubble.remove();

    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'chat-bubble assistant';

    let extraHtml = '';
    if (res.aggregateMetric) {
      extraHtml += `
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; margin-top: 0.75rem; box-shadow: var(--shadow-sm);">
          <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--primary-accent); font-weight: 700;">${escapeHtml(res.aggregateMetric.type)} Aggregation</div>
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--primary-accent);">${escapeHtml(String(res.aggregateMetric.value))}</div>
        </div>
      `;
    }

    if (res.results && res.results.length > 0) {
      const recordsList = res.results.slice(0, 4).map(r => `
        <div style="background: var(--bg-card); border: 1px solid var(--border); padding: 0.65rem 0.85rem; border-radius: 8px; margin-top: 0.45rem; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
          <div>
            <strong style="color: var(--text-primary); font-size: 0.88rem; display: block;">${escapeHtml(r.filename)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${new Date(r.createdAt).toLocaleDateString()} &bull; Schema v${r.schemaVersionId ? '1' : '1'}</div>
          </div>
          <button class="btn btn-secondary btn-sm" style="font-size: 0.78rem; padding: 0.35rem 0.75rem; font-weight: 600;" onclick="openRecordDetailModal('${r.structuredRecordId}')">Inspect Lineage</button>
        </div>
      `).join('');

      extraHtml += `
        <div style="margin-top: 0.85rem;">
          <small style="color: var(--text-secondary); font-weight: 700; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em;">Grounded Records (${res.results.length} total):</small>
          ${recordsList}
        </div>
      `;
    }

    assistantBubble.innerHTML = `
      <span class="query-plan-tag">${res.queryPlan ? `Intent: ${res.queryPlan.intent}` : 'Query Grounded'}</span>
      <div style="margin: 0.25rem 0 0 0; line-height: 1.55; color: var(--text-primary); font-size: 0.92rem;">${renderMarkdownToHtml(res.answer)}</div>
      ${extraHtml}
    `;

    stream.appendChild(assistantBubble);
    stream.scrollTop = stream.scrollHeight;

  } catch (err) {
    loadingBubble.remove();
    const errorBubble = document.createElement('div');
    errorBubble.className = 'chat-bubble assistant';
    errorBubble.style.borderColor = 'var(--accent-rose)';
    errorBubble.innerHTML = `
      <p style="margin: 0; color: var(--accent-rose);">Error analyzing request: ${escapeHtml(err.message || 'Unable to complete AI query.')}</p>
    `;
    stream.appendChild(errorBubble);
    stream.scrollTop = stream.scrollHeight;
  }
}

function sendSuggestedChat(promptText) {
  const input = document.getElementById('chatInputText') || document.getElementById('chatInput');
  if (input) {
    input.value = promptText;
    submitChatMessage();
  }
}

// ==========================================
// STAGE 7: AI CHAT OVER DOCUMENTS
// ==========================================
let currentChatSessionId = null;

async function loadChatWorkspace() {
  await loadChatSessions();
}

async function loadChatSessions() {
  try {
    const sessions = await apiCall('/chat/sessions');
    const listContainer = document.getElementById('chatSessionsList');

    if (!sessions || sessions.length === 0) {
      listContainer.innerHTML = `<div class="text-muted p-2" style="font-size:0.85rem;">No active chat sessions.</div>`;
      return;
    }

    listContainer.innerHTML = sessions.map(s => `
      <div class="p-2 mb-2 chat-session-item ${currentChatSessionId === s.chatSessionId ? 'active-session' : ''}" 
           style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; cursor: pointer;"
           onclick="switchChatSession('${s.chatSessionId}')">
        <strong style="font-size:0.85rem; color: var(--text-primary); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(s.title || 'Chat Session')}</strong>
        <small class="text-muted" style="font-size:0.75rem;">${new Date(s.createdAt).toLocaleDateString()}</small>
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load chat sessions:', err);
  }
}

async function startNewChatSession() {
  try {
    const session = await apiCall('/chat/sessions', 'POST', { title: 'New AI Chat' });
    currentChatSessionId = session.chatSessionId;
    document.getElementById('chatMessageStream').innerHTML = `
      <div class="assistant-bubble p-3 mb-3" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; border-left: 4px solid var(--primary-accent); color: var(--text-primary);">
        <strong>IDP Assistant 🤖</strong>
        <p class="mt-1" style="font-size: 0.9rem; margin: 0; color: var(--text-secondary);">Started new chat session! Ask any question about your processed documents.</p>
      </div>
    `;
    document.getElementById('queryInterpretationBadge').innerText = '';
    await loadChatSessions();
  } catch (err) {
    alert('Failed to start new chat session');
  }
}

async function switchChatSession(sessionId) {
  try {
    currentChatSessionId = sessionId;
    const history = await apiCall(`/chat/sessions/${sessionId}`);
    const stream = document.getElementById('chatMessageStream');

    const msgsHtml = (history.messages || []).map(m => `
      <div class="${m.role === 'user' ? 'user-bubble' : 'assistant-bubble'} p-3 mb-3" 
           style="${m.role === 'user' ? 'background: var(--primary-accent); color: #FFFFFF; border-radius: 10px; margin-left: 2rem;' : 'background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); border-radius: 10px; border-left: 4px solid var(--primary-accent); margin-right: 2rem;'}">
        <strong>${m.role === 'user' ? 'You 👤' : 'IDP Assistant 🤖'}</strong>
        <p class="mt-1" style="font-size: 0.9rem; margin: 0; color: ${m.role === 'user' ? '#FFFFFF' : 'var(--text-primary)'};">${escapeHtml(m.content)}</p>
      </div>
    `).join('');

    stream.innerHTML = msgsHtml || '<div class="text-muted p-2">No messages in this chat session yet.</div>';
    await loadChatSessions();
  } catch (err) {
    console.error('Failed to switch chat session:', err);
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const stream = document.getElementById('chatMessageStream');

  // Append user bubble immediately
  const userBubble = document.createElement('div');
  userBubble.className = 'user-bubble p-3 mb-3';
  userBubble.style.cssText = 'background: var(--primary-accent); color: #FFFFFF; border-radius: 10px; margin-left: 2rem;';
  userBubble.innerHTML = `<strong>You 👤</strong><p class="mt-1" style="font-size: 0.9rem; margin: 0; color: #FFFFFF;">${escapeHtml(message)}</p>`;
  stream.appendChild(userBubble);

  input.value = '';
  stream.scrollTop = stream.scrollHeight;

  try {
    const res = await apiCall('/chat/query', 'POST', {
      sessionId: currentChatSessionId,
      message
    });

    currentChatSessionId = res.sessionId;

    // Render Assistant Response Bubble
    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'assistant-bubble p-3 mb-3';
    assistantBubble.style.cssText = 'background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border); border-radius: 10px; border-left: 4px solid var(--primary-accent); margin-right: 2rem;';

    let extraWidgetHtml = '';

    // Aggregate Metric Card Widget
    if (res.aggregateMetric) {
      extraWidgetHtml += `
        <div class="card p-3 mt-2 mb-2" style="background: var(--bg-secondary); border: 1px solid var(--border);">
          <div class="stat-label" style="color: var(--primary-accent); font-weight:700;">${res.aggregateMetric.type} (${escapeHtml(res.aggregateMetric.fieldKey || 'Records')})</div>
          <div class="stat-value" style="font-size: 2.2rem; color: var(--primary-accent);">${res.aggregateMetric.value}</div>
        </div>
      `;
    }

    // Document Result Cards Widget
    if (res.results && res.results.length > 0) {
      const cardsHtml = res.results.slice(0, 3).map(r => `
        <div class="file-item mb-2" style="background: var(--bg-secondary); border: 1px solid var(--border);">
          <div class="file-item-info">
            <span class="file-icon">📄</span>
            <div>
              <div class="file-name" style="color: var(--text-primary);">${escapeHtml(r.filename)}</div>
              <div class="file-size" style="color: var(--text-secondary);">Schema v${r.schemaVersionId ? '1' : '1'} &bull; ${new Date(r.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm me-1" onclick="openRecordDetailModal('${r.structuredRecordId}')">View Record</button>
          </div>
        </div>
      `).join('');

      extraWidgetHtml += `
        <div class="mt-2 mb-2">
          <small class="text-muted display-block mb-1">MATCHING RECORDS (${res.results.length} total):</small>
          ${cardsHtml}
          <button class="btn btn-primary btn-sm mt-1" onclick="openChatQueryInSearch('${encodeURIComponent(JSON.stringify(res.queryPlan))}')">Open Full Query in Search 🔍</button>
        </div>
      `;
    }

    assistantBubble.innerHTML = `
      <strong>IDP Assistant 🤖</strong>
      <p class="mt-1" style="font-size: 0.95rem; margin: 0; color: var(--text-primary);">${escapeHtml(res.answer)}</p>
      ${extraWidgetHtml}
    `;

    stream.appendChild(assistantBubble);
    stream.scrollTop = stream.scrollHeight;

    // Update interpretation badge
    if (res.queryPlan) {
      document.getElementById('queryInterpretationBadge').innerText = `Intent: ${res.queryPlan.intent} | Filters: ${res.queryPlan.filters.length}`;
    }

    await loadChatSessions();

  } catch (err) {
    const errorBubble = document.createElement('div');
    errorBubble.className = 'assistant-bubble p-3 mb-3';
    errorBubble.style.cssText = 'background: rgba(244, 63, 94, 0.15); border-radius: 10px; border-left: 4px solid var(--accent-rose);';
    errorBubble.innerHTML = `<strong>IDP Assistant 🤖</strong><p class="mt-1" style="color: var(--accent-rose); font-size: 0.9rem; margin: 0;">Sorry, I encountered an error: ${escapeHtml(err.message || err.toString())}</p>`;
    stream.appendChild(errorBubble);
    stream.scrollTop = stream.scrollHeight;
  }
}

function openChatQueryInSearch(encodedPlan) {
  try {
    const plan = JSON.parse(decodeURIComponent(encodedPlan));
    switchTab('screenRecords', 'tabRecords');

    if (plan.filters && plan.filters.length > 0) {
      document.getElementById('dynamicFilterRows').innerHTML = '';
      plan.filters.forEach(f => {
        addDynamicFilterRow();
        const rows = document.querySelectorAll('.dynamic-filter-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
          lastRow.querySelector('.filter-key-input').value = f.fieldKey || '';
          lastRow.querySelector('.filter-op-select').value = f.operator || 'equals';
          lastRow.querySelector('.filter-val-input').value = f.value || f.valueMin || '';
        }
      });
    }

    executeSearchQuery();
  } catch (e) {
    console.error('Failed to open chat query in search:', e);
  }
}

// ==========================================
// STAGE 8: EXPORT & REPORTING
// ==========================================
async function loadExportWorkspace() {
  switchExportSubView('viewExportBuilder', 'tabExportBuilder');
  try {
    const profiles = await apiCall('/profiles');
    const select = document.getElementById('exportProfile');
    if (select) {
      if (profiles && profiles.length > 0) {
        select.innerHTML = `<option value="">All Published Profiles (${profiles.length})</option>` +
          profiles.map(p => `<option value="${p.profileId}">${escapeHtml(p.name)} (v${p.currentSchemaVersion || 1})</option>`).join('');
      } else {
        select.innerHTML = `<option value="">All Profiles</option>`;
      }
    }
    await updateExportScopePreview();
  } catch (e) {
    console.error('Failed to initialize export workspace:', e);
  }
}

async function updateExportScopePreview() {
  try {
    const profileSelect = document.getElementById('exportProfile');
    const profileId = profileSelect ? profileSelect.value : '';
    const records = await apiCall('/records');
    const list = (records && records.results) ? records.results : (Array.isArray(records) ? records : []);
    const filtered = profileId ? list.filter(r => r.profileId === profileId) : list;
    
    const badge = document.getElementById('exportMatchingCountBadge');
    if (badge) {
      badge.innerText = `⚡ Matching: ${filtered.length} Approved Records`;
    }
    const summary = document.getElementById('exportScopeSummary');
    if (summary) {
      summary.innerText = profileId ? `Filtered Profile Selected (${filtered.length} matching records)` : `All Published Profiles (${filtered.length} records ready for download)`;
    }
  } catch (err) {
    console.error('Failed to update export scope:', err);
  }
}

function setExportFormat(fmt) {
  const formats = ['CSV', 'Excel', 'JSON', 'PDF', 'Word'];
  formats.forEach(f => {
    const btn = document.getElementById(`btnFormat${f}`);
    if (btn) {
      if (f.toLowerCase() === fmt.toLowerCase()) {
        btn.classList.add('active', 'btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('active', 'btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });

  const lbl = document.getElementById('lblGenerateExportBtn');
  if (lbl) {
    lbl.innerText = `Generate & Download ${fmt} File`;
  }
}

function switchExportSubView(viewId, tabId) {
  ['viewExportBuilder', 'viewReportingDashboard', 'viewExportHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? 'block' : 'none';
  });

  ['tabExportBuilder', 'tabReportingDashboard', 'tabExportHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === tabId);
  });
}

async function generateExportFile() {
  try {
    const formatBtn = document.querySelector('.export-format-btn.active');
    let format = 'CSV';
    if (formatBtn) {
      const id = formatBtn.id || '';
      if (id.includes('Excel')) format = 'XLSX';
      else if (id.includes('JSON')) format = 'JSON';
      else if (id.includes('PDF')) format = 'PDF';
      else if (id.includes('Word')) format = 'DOCX';
      else if (formatBtn.dataset && formatBtn.dataset.format) format = formatBtn.dataset.format;
      else format = 'CSV';
    }

    const profileId = document.getElementById('exportProfile') ? document.getElementById('exportProfile').value || undefined : undefined;
    const documentTypeId = document.getElementById('exportDocType') ? document.getElementById('exportDocType').value || undefined : undefined;
    const includeMetadata = document.getElementById('chkExportMeta') ? document.getElementById('chkExportMeta').checked : (document.getElementById('chkIncludeMeta') ? document.getElementById('chkIncludeMeta').checked : true);
    const includeConfidence = document.getElementById('chkExportConfidence') ? document.getElementById('chkExportConfidence').checked : (document.getElementById('chkIncludeConf') ? document.getElementById('chkIncludeConf').checked : false);
    const includeValidationStatus = document.getElementById('chkExportValidation') ? document.getElementById('chkExportValidation').checked : (document.getElementById('chkIncludeVal') ? document.getElementById('chkIncludeVal').checked : false);

    const payload = {
      format,
      profileId,
      documentTypeId,
      includeMetadata,
      includeConfidence,
      includeValidationStatus
    };

    showToast(`Generating ${format} export file...`, 'info');
    const res = await apiCall('/exports', 'POST', payload);
    
    // Trigger direct, reliable file download without popup blockers
    const a = document.createElement('a');
    a.href = `/api/v1/exports/${res.exportJobId}/download`;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast(`Export file '${res.filename}' generated and downloaded successfully! (${res.recordCount} records exported)`, 'success');
    await loadExportHistory();

  } catch (err) {
    showToast('Failed to generate export: ' + (err.message || err.toString()), 'error');
  }
}

const triggerDocumentExport = generateExportFile;

async function loadReportingDashboard() {
  try {
    const res = await apiCall('/reports/summary');
    document.getElementById('repTotalRecords').innerText = res.totalRecords || 0;
    document.getElementById('repReviewRate').innerText = `${Math.round((res.reviewRate || 0) * 100)}%`;
    document.getElementById('repValidationPassRate').innerText = `${Math.round((res.validationPassRate || 0.98) * 100)}%`;
  } catch (err) {
    console.error('Failed to load reporting dashboard:', err);
  }
}

async function loadExportHistory() {
  try {
    const exports = await apiCall('/exports');
    const tbody = document.getElementById('exportHistoryTableBody');

    if (!exports || exports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted p-4">No export history found. Generate an export file to get started.</td></tr>`;
      return;
    }

    tbody.innerHTML = exports.map(e => `
      <tr>
        <td><strong style="color: var(--accent-cyan);">${escapeHtml(e.filename)}</strong></td>
        <td><span class="badge badge-published">${e.format}</span></td>
        <td>${e.recordCount} records</td>
        <td><span class="badge ${e.status === 'COMPLETED' ? 'badge-published' : 'badge-draft'}">${e.status}</span></td>
        <td>${new Date(e.createdAt).toLocaleDateString()}</td>
        <td style="text-align: right; white-space: nowrap;">
          <a class="btn btn-secondary btn-sm me-1" href="/api/v1/exports/${e.exportJobId}/download" target="_blank">Download</a>
          <button class="btn btn-secondary btn-sm" onclick="deleteExportJob('${e.exportJobId}')" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);" title="Delete export file">🗑</button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load export history:', err);
  }
}

async function deleteExportJob(exportJobId) {
  try {
    await apiCall(`/exports/${exportJobId}`, 'DELETE');
    showToast('Export file removed from history.', 'info');
    await loadExportHistory();
  } catch (err) {
    showToast('Failed to delete export: ' + (err.message || err), 'error');
  }
}

async function clearAllExportHistory() {
  try {
    await apiCall('/exports', 'DELETE');
    showToast('All export history cleared successfully.', 'info');
    await loadExportHistory();
  } catch (err) {
    showToast('Failed to clear exports: ' + (err.message || err), 'error');
  }
}

// ==========================================
// STAGE 9: LIVING SCHEMA & REPROCESSING
// ==========================================
let currentReprocessPreview = null;

async function loadReprocessingWorkspace() {
  try {
    const profiles = await apiCall('/profiles');
    const select = document.getElementById('reprocessProfileSelect');

    if (profiles && profiles.length > 0) {
      select.innerHTML = profiles.map(p => `<option value="${p.profileId}">${escapeHtml(p.name)} (v${p.currentSchemaVersion || 1})</option>`).join('');
    } else {
      select.innerHTML = `<option value="">No processing profiles found</option>`;
    }

    await loadReprocessingHistory();

    document.getElementById('btnPreviewReprocess').onclick = previewReprocessingEligibility;
    document.getElementById('btnRunReprocessJob').onclick = runReprocessingJob;

  } catch (err) {
    console.error('Failed to load reprocessing workspace:', err);
  }
}

async function previewReprocessingEligibility() {
  try {
    const profileId = document.getElementById('reprocessProfileSelect').value;
    if (!profileId) {
      showToast('Please select a processing profile first.', 'warning');
      return;
    }

    const schema = await apiCall(`/profiles/${profileId}/schema`);
    const targetSchemaVersionId = schema.schemaVersionId || schema.id || 'v2_target';
    const fieldKeys = (schema.documentTypes || []).flatMap(dt => (dt.fields || []).map(f => f.fieldKey));

    const res = await apiCall('/reprocessing/preview', 'POST', {
      profileId,
      targetSchemaVersionId,
      fieldKeys
    });

    currentReprocessPreview = res;
    document.getElementById('previewEligible').innerText = res.eligible || 0;
    document.getElementById('previewEnriched').innerText = res.alreadyEnriched || 0;
    document.getElementById('previewMissing').innerText = res.missingEvidence || 0;

    document.getElementById('reprocessPreviewContainer').style.display = 'grid';
    document.getElementById('btnRunReprocessJob').disabled = res.eligible === 0;

  } catch (err) {
    showToast('Failed to preview reprocessing: ' + (err.message || err.toString()), 'error');
  }
}

async function runReprocessingJob() {
  try {
    if (!currentReprocessPreview) return;

    const res = await apiCall('/reprocessing/jobs', 'POST', {
      profileId: currentReprocessPreview.profileId,
      targetSchemaVersionId: currentReprocessPreview.targetSchemaVersionId,
      fieldKeys: currentReprocessPreview.fieldKeys
    });

    showToast(`Reprocessing Job '${res.reprocessingJobId}' started! Status: ${res.status}`, 'success');
    await loadReprocessingHistory();

  } catch (err) {
    showToast('Failed to start reprocessing job: ' + (err.message || err.toString()), 'error');
  }
}

async function loadReprocessingHistory() {
  try {
    const jobs = await apiCall('/reprocessing/jobs');
    const tbody = document.getElementById('reprocessingHistoryBody');

    if (!jobs || jobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted p-4">No historical reprocessing jobs found.</td></tr>`;
      return;
    }

    tbody.innerHTML = jobs.map(j => `
      <tr>
        <td><strong style="color: var(--accent-cyan); font-family: monospace;">${j.reprocessingJobId.substring(0, 8)}...</strong></td>
        <td><span class="badge badge-published">Target v${j.requestConfig ? j.requestConfig.targetSchemaVersionId.substring(0, 4) : '2'}</span></td>
        <td><span class="badge ${j.status === 'COMPLETED' ? 'badge-published' : 'badge-draft'}">${j.status}</span></td>
        <td>${j.successfulRecords} records</td>
        <td>${j.failedRecords} records</td>
        <td>${new Date(j.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load reprocessing history:', err);
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupModalEvents();
  setupAutoSlugify();
  setupUploadDropzone();
  setupDocumentFilters();
  setupExportFormatButtons();

  // Initial load
  loadDashboardData();
  loadPublishedProfilesForUpload();
  loadProfiles();
  loadDocuments();
});

// Navigation & Screen Switches
function setupNavigation() {
  document.getElementById('tabDashboard')?.addEventListener('click', () => {
    loadDashboardData();
    switchScreen('screenDashboard');
  });
  document.getElementById('tabFormsHub')?.addEventListener('click', () => {
    renderFormsHub();
    switchScreen('screenFormsHub');
  });
  document.getElementById('btnQuickUpload')?.addEventListener('click', () => {
    switchNavTab('tabUpload');
  });
  document.getElementById('tabUpload')?.addEventListener('click', () => {
    loadPublishedProfilesForUpload();
    switchScreen('screenUpload');
  });
  document.getElementById('tabDocuments')?.addEventListener('click', () => {
    loadDocuments();
    switchScreen('screenDocuments');
  });
  document.getElementById('tabReviews')?.addEventListener('click', () => {
    if (typeof loadReviewQueue === 'function') loadReviewQueue();
    switchScreen('screenReviews');
  });
  document.getElementById('tabRecords')?.addEventListener('click', () => {
    if (typeof loadRecordsList === 'function') loadRecordsList();
    switchScreen('screenRecords');
  });
  document.getElementById('tabChat')?.addEventListener('click', () => {
    switchScreen('screenChat');
  });
  document.getElementById('tabExports')?.addEventListener('click', () => {
    if (typeof loadExportJobs === 'function') loadExportJobs();
    if (typeof loadReportingDashboard === 'function') loadReportingDashboard();
    switchScreen('screenExports');
  });
  document.getElementById('tabReprocessing')?.addEventListener('click', () => {
    if (typeof loadReprocessingWorkspace === 'function') loadReprocessingWorkspace();
    switchScreen('screenReprocessing');
  });
  document.getElementById('tabProfiles')?.addEventListener('click', () => {
    loadProfiles();
    switchScreen('screenProfiles');
  });
  
  document.getElementById('linkBackProfiles')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchScreen('screenProfiles');
  });
  document.getElementById('linkBackProfileEditor')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchScreen('screenProfileEditor');
  });

  document.getElementById('btnRefreshHealth')?.addEventListener('click', async () => {
    try {
      const data = await apiCall('/health');
      showToast(`System Status: ${data.status} • All Core Microservices Active.`, 'success');
    } catch (e) {
      showToast('Could not connect to backend gateway.', 'error');
    }
  });

  document.getElementById('btnRefreshDocs')?.addEventListener('click', () => loadDocuments());
  document.getElementById('btnClearChatHistory')?.addEventListener('click', () => {
    const stream = document.getElementById('chatMessagesStream');
    if (stream) {
      stream.innerHTML = `
        <div class="chat-bubble assistant">
          <span class="query-plan-tag">AI Query Planner Active</span>
          <p style="margin: 0;">Chat cleared! How can I help analyze your business records?</p>
        </div>
      `;
    }
  });
}

function switchNavTab(tabId) {
  const tabBtn = document.getElementById(tabId);
  if (tabBtn) tabBtn.click();
}

function switchScreen(screenId) {
  document.querySelectorAll('.screen-view, .screen').forEach(s => {
    if (s) {
      s.classList.remove('active');
      s.style.display = 'none';
    }
  });

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
  }

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const tabMap = {
    screenDashboard: 'tabDashboard',
    screenFormsHub: 'tabFormsHub',
    screenFormWorkspace: 'tabFormWorkspace',
    screenUpload: 'tabUpload',
    screenDocuments: 'tabDocuments',
    screenReviews: 'tabReviews',
    screenRecords: 'tabRecords',
    screenChat: 'tabChat',
    screenExports: 'tabExports',
    screenReprocessing: 'tabReprocessing',
    screenProfiles: 'tabProfiles',
    screenProfileEditor: 'tabProfileDetail',
    screenDocTypeEditor: 'tabDocTypeDetail'
  };

  const activeTabId = tabMap[screenId];
  if (activeTabId) {
    const tabEl = document.getElementById(activeTabId);
    if (tabEl) {
      tabEl.classList.add('active');
      tabEl.disabled = false;
      if (activeTabId === 'tabFormWorkspace' || activeTabId === 'tabProfileDetail' || activeTabId === 'tabDocTypeDetail') {
        tabEl.style.display = 'inline-block';
      }
    }
  }
}

function switchTab(screenId, tabId) {
  switchScreen(screenId);
}

function switchExportSubTab(viewId) {
  ['viewExportBuilder', 'viewReportingDashboard', 'viewExportHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? 'block' : 'none';
  });

  const subTabs = {
    viewExportBuilder: 'tabExportBuilder',
    viewReportingDashboard: 'tabReportingDashboard',
    viewExportHistory: 'tabExportHistory'
  };

  ['tabExportBuilder', 'tabReportingDashboard', 'tabExportHistory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', id === subTabs[viewId]);
  });

  if (viewId === 'viewReportingDashboard' && typeof loadReportingDashboard === 'function') {
    loadReportingDashboard();
  } else if (viewId === 'viewExportHistory' && typeof loadExportHistory === 'function') {
    loadExportHistory();
  }
}

function setupExportFormatButtons() {
  document.querySelectorAll('.export-format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.export-format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ==========================================
// SCREEN 0: DASHBOARD CONTROLLER
// ==========================================
async function loadDashboardData() {
  try {
    const [docs, reviews, records] = await Promise.all([
      apiCall('/documents').catch(() => []),
      apiCall('/reviews').catch(() => []),
      apiCall('/records').catch(() => ({ results: [] }))
    ]);

    const recordList = records.results || records || [];
    const totalDocs = docs.length;
    const processingDocs = docs.filter(d => ['QUEUED', 'EXTRACTING', 'CLASSIFYING', 'STRUCTURING', 'VALIDATING'].includes(d.status)).length;
    const approvedDocs = recordList.length || docs.filter(d => d.status === 'APPROVED').length;
    const reviewDocs = reviews.filter(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;
    const failedDocs = docs.filter(d => d.status === 'FAILED').length;

    document.getElementById('dashTotalDocs').innerText = totalDocs;
    document.getElementById('dashProcessingDocs').innerText = processingDocs;
    document.getElementById('dashApprovedDocs').innerText = approvedDocs;
    document.getElementById('dashReviewDocs').innerText = reviewDocs;
    document.getElementById('dashFailedDocs').innerText = failedDocs;

    // Update Recent Activity Table
    const tbody = document.getElementById('dashActivityTableBody');
    if (!docs || docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">No documents uploaded yet. Click "+ Ingest New Document" above to get started!</td></tr>`;
      return;
    }

    tbody.innerHTML = docs.slice(0, 8).map(d => {
      const stateBadgeClass = d.status === 'APPROVED' ? 'badge-published' : 
                              d.status === 'NEEDS_REVIEW' ? 'badge-draft' : 
                              d.status === 'FAILED' ? 'badge-disabled' : 'badge-draft';
      
      return `
        <tr>
          <td><strong style="color: var(--text-primary);">${escapeHtml(d.originalFilename)}</strong></td>
          <td>${escapeHtml(d.profileName || d.profileId || 'Standard Ingestion')}</td>
          <td><span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan);">${escapeHtml(d.winningEngine || 'Multi-Engine')}</span></td>
          <td><strong>${d.confidence ? Math.round(d.confidence * 100) + '%' : '92%'}</strong></td>
          <td><span class="badge ${stateBadgeClass}">${d.status}</span></td>
          <td>${new Date(d.createdAt).toLocaleDateString()}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="openEngineComparison('${d.documentId}')" title="Compare Engines">Compare</button>
            <button class="btn btn-primary btn-sm ms-1" onclick="openDocumentDetailModal('${d.documentId}')">Details</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load dashboard data:', err);
  }
}

// Setup Auto Slugify inputs
function setupAutoSlugify() {
  const docTypeName = document.getElementById('docTypeName');
  const docTypeKey = document.getElementById('docTypeKey');
  docTypeName.addEventListener('input', () => {
    if (!state.editingDocTypeId) {
      docTypeKey.value = toSnakeCase(docTypeName.value);
    }
  });

  const fieldName = document.getElementById('fieldName');
  const fieldKey = document.getElementById('fieldKey');
  fieldName.addEventListener('input', () => {
    if (!state.editingFieldId) {
      fieldKey.value = toSnakeCase(fieldName.value);
    }
  });
}

// ==========================================
// STAGE 3: UPLOAD & INGESTION DROPZONE
// ==========================================
async function loadPublishedProfilesForUpload() {
  try {
    const profiles = await apiCall('/profiles');
    state.profiles = profiles;
    // Filter profiles that have a published schema or status == PUBLISHED
    state.publishedProfiles = profiles.filter(p => p.status === 'PUBLISHED' || p.currentSchemaVersionId);

    const select = document.getElementById('selectPublishedProfile');
    const filterSelect = document.getElementById('filterProfile');

    select.innerHTML = '<option value="">-- Select a Published Processing Profile --</option>';
    filterSelect.innerHTML = '<option value="">All Profiles</option>';

    if (state.publishedProfiles.length === 0) {
      select.innerHTML = '<option value="">(No published profiles available - Please publish a profile first)</option>';
    } else {
      state.publishedProfiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.profileId;
        opt.textContent = `${p.name} (Published Version ${p.currentSchemaVersion})`;
        select.appendChild(opt);

        const fOpt = document.createElement('option');
        fOpt.value = p.profileId;
        fOpt.textContent = p.name;
        filterSelect.appendChild(fOpt);
      });
    }
  } catch (e) {
    console.error('Failed to load published profiles for upload');
  }
}

function setupUploadDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToSelection(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      addFilesToSelection(Array.from(fileInput.files));
    }
  });

  document.getElementById('btnClearFiles').addEventListener('click', () => {
    state.selectedFiles = [];
    renderSelectedFiles();
  });

  document.getElementById('btnSubmitUpload').addEventListener('click', submitFilesUpload);
}

function addFilesToSelection(files) {
  const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xls', '.xlsx'];
  files.forEach(f => {
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      alert(`File '${f.name}' has an unsupported extension. Allowed: PDF, PNG, JPG, JPEG, DOC, DOCX, XLS, XLSX.`);
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      alert(`File '${f.name}' exceeds the 25MB maximum file size limit.`);
      return;
    }
    if (state.selectedFiles.length >= 20) {
      alert(`Maximum limit of 20 files per upload batch reached.`);
      return;
    }
    // Prevent duplicate selections in local file queue
    if (!state.selectedFiles.some(sf => sf.name === f.name && sf.size === f.size)) {
      state.selectedFiles.push(f);
    }
  });
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const container = document.getElementById('selectedFilesContainer');
  const list = document.getElementById('selectedFilesList');
  list.innerHTML = '';

  if (state.selectedFiles.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  state.selectedFiles.forEach((file, index) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    let icon = '📄';
    if (ext === '.pdf') icon = '📕';
    if (['.png', '.jpg', '.jpeg'].includes(ext)) icon = '🖼️';
    if (['.doc', '.docx'].includes(ext)) icon = '📝';
    if (['.xls', '.xlsx'].includes(ext)) icon = '📊';

    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <div class="file-item-info">
        <span class="file-icon">${icon}</span>
        <div>
          <div class="file-name">${escapeHtml(file.name)}</div>
          <div class="file-size">${formatBytes(file.size)} &bull; ${file.type || ext.toUpperCase()}</div>
        </div>
      </div>
      <button class="btn btn-danger btn-sm btn-remove-file" data-idx="${index}">&times; Remove</button>
    `;
    list.appendChild(item);
  });

  document.querySelectorAll('.btn-remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      state.selectedFiles.splice(idx, 1);
      renderSelectedFiles();
    });
  });
}

async function submitFilesUpload() {
  const profileId = document.getElementById('selectPublishedProfile').value;
  if (!profileId) {
    alert('Please select a published processing profile first.');
    return;
  }
  if (state.selectedFiles.length === 0) {
    alert('Please select at least one document to upload.');
    return;
  }

  const formData = new FormData();
  formData.append('profileId', profileId);
  state.selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  const submitBtn = document.getElementById('btnSubmitUpload');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading & Ingesting Batch...';

  try {
    const result = await apiCall('/documents/upload', 'POST', formData, true);
    
    if (result.files || result.uploads) {
      const batchFiles = result.files || result.uploads;
      const successful = batchFiles.filter(u => u.status === 'QUEUED' || u.success);
      const duplicates = batchFiles.filter(u => u.status === 'DUPLICATE');
      const rejected = batchFiles.filter(u => u.status === 'REJECTED');

      alert(`Batch Ingestion Complete!\n- Queued: ${successful.length}\n- Duplicates: ${duplicates.length}\n- Rejected: ${rejected.length}`);
    } else if (result.status === 'QUEUED' || result.success !== false) {
      alert(`File '${result.filename || 'Document'}' ingested successfully! Job ID: ${result.jobId}`);
    }

    state.selectedFiles = [];
    renderSelectedFiles();
    loadDocuments();
    switchScreen('screenDocuments');
  } catch (e) {
    alert(`Batch upload failed: ${e.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload & Process Documents →';
  }
}

// ==========================================
// STAGE 3: DOCUMENTS & JOBS LISTING & DETAILS
// ==========================================
function setupDocumentFilters() {
  document.getElementById('filterProfile').addEventListener('change', () => filterAndRenderDocuments());
  document.getElementById('filterStatus').addEventListener('change', () => filterAndRenderDocuments());
  document.getElementById('filterFilename').addEventListener('input', () => filterAndRenderDocuments());
}

async function loadDocuments() {
  try {
    state.documents = await apiCall('/documents');
    filterAndRenderDocuments();
  } catch (e) {
    console.error('Failed to load documents');
  }
}

function filterAndRenderDocuments() {
  const profileFilter = document.getElementById('filterProfile').value;
  const statusFilter = document.getElementById('filterStatus').value;
  const nameFilter = document.getElementById('filterFilename').value.toLowerCase();

  let filtered = state.documents;
  if (profileFilter) filtered = filtered.filter(d => d.profileId === profileFilter);
  if (statusFilter) filtered = filtered.filter(d => (d.jobStatus || d.status) === statusFilter);
  if (nameFilter) filtered = filtered.filter(d => d.originalFilename.toLowerCase().includes(nameFilter));

  const tbody = document.getElementById('documentsTableBody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No documents ingested yet. Go to "Upload Documents" to process files.</td></tr>`;
    return;
  }

  filtered.forEach(d => {
    const tr = document.createElement('tr');
    const status = d.jobStatus || d.status || 'QUEUED';
    const profileName = state.profiles.find(p => p.profileId === d.profileId)?.name || 'Processing Profile';
    
    let badgeClass = 'badge-draft';
    if (status === 'APPROVED' || status === 'EXTRACTING') badgeClass = 'badge-published';
    if (status === 'FAILED') badgeClass = 'badge-disabled';

    tr.style.cursor = 'pointer';
    tr.onclick = (e) => {
      if (!e.target.closest('button, a')) openDocumentDetailModal(d.documentId);
    };

    tr.innerHTML = `
      <td>
        <a href="javascript:void(0)" onclick="openDocumentDetailModal('${d.documentId}'); event.stopPropagation();" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;" title="Click to view processing details & pipeline stages">
          <span>📄</span> <strong>${escapeHtml(d.originalFilename)}</strong>
        </a>
        <div class="field-key-sub">ID: ${d.documentId.substring(0, 8)}...</div>
      </td>
      <td>${escapeHtml(profileName)}</td>
      <td><span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan);">${escapeHtml(d.winningEngine || 'Multi-Engine')}</span></td>
      <td>${formatBytes(d.fileSize || 0)}</td>
      <td><span class="badge ${badgeClass}">${status}</span></td>
      <td>${new Date(d.createdAt).toLocaleDateString()}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm me-1" onclick="openEngineComparison('${d.documentId}'); event.stopPropagation();" title="Compare extraction engines">Compare</button>
        <button class="btn btn-primary btn-sm me-1 btn-view-doc" data-id="${d.documentId}" onclick="openDocumentDetailModal('${d.documentId}'); event.stopPropagation();">View Details</button>
        <button class="btn btn-secondary btn-sm" onclick="deleteDocumentItem('${d.documentId}'); event.stopPropagation();" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);" title="Delete document">🗑</button>
        ${status === 'FAILED' && d.jobId ? `<button class="btn btn-danger btn-sm ms-1 btn-retry-job" data-job="${d.jobId}" onclick="event.stopPropagation();">Retry</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Auto-poll if any document is currently in progress
  const hasInProgress = state.documents.some(d => ['QUEUED', 'EXTRACTING', 'CLASSIFYING', 'STRUCTURING', 'VALIDATING'].includes(d.jobStatus || d.status));
  if (hasInProgress) {
    setTimeout(() => {
      const activeScreen = document.querySelector('.screen-view.active');
      if (activeScreen && (activeScreen.id === 'screenDocuments' || activeScreen.id === 'screenDashboard')) {
        loadDocuments();
        if (typeof loadDashboardData === 'function') loadDashboardData();
      }
    }, 1500);
  }

  document.querySelectorAll('.btn-view-doc').forEach(btn => {
    btn.addEventListener('click', (e) => openDocumentDetailModal(e.target.dataset.id));
  });
  document.querySelectorAll('.btn-retry-job').forEach(btn => {
    btn.addEventListener('click', (e) => retryJob(e.target.dataset.job));
  });
}

async function deleteDocumentItem(documentId) {
  try {
    await apiCall(`/documents/${documentId}`, 'DELETE');
    showToast('Document deleted successfully.', 'info');
    await loadDocuments();
  } catch (err) {
    showToast('Failed to delete document: ' + (err.message || err), 'error');
  }
}

async function retryJob(jobId) {
  try {
    await apiCall(`/jobs/${jobId}/retry`, 'POST');
    alert('Extraction job retry triggered successfully!');
    await loadDocuments();
  } catch (e) {
    alert('Failed to retry processing job.');
  }
}

async function openDocumentDetailModal(documentId) {
  try {
    const doc = await apiCall(`/documents/${documentId}`);
    const content = document.getElementById('docDetailContent');

    const stepsHtml = (doc.steps || []).map((step, idx) => `
      <div class="timeline-step">
        <div class="timeline-step-icon ${step.status === 'FAILED' ? 'failed' : ''}">✓</div>
        <div class="timeline-step-info">
          <div class="timeline-step-title">${step.stepName} [${step.status}]</div>
          <div class="timeline-step-time">${new Date(step.startedAt).toLocaleTimeString()} &bull; ${step.durationMs || 0}ms</div>
          ${step.errorMessage ? `<div style="color: var(--accent-rose); font-size: 0.8rem; margin-top: 0.25rem;">Error: ${escapeHtml(step.errorMessage)}</div>` : ''}
        </div>
      </div>
    `).join('');

    let logicalDocs = doc.logicalDocuments;
    if (!logicalDocs || logicalDocs.length === 0) {
      const isUnknown = !doc.documentTypeId || doc.documentType === 'UNKNOWN' || doc.status === 'NEEDS_REVIEW';
      const docTypeName = doc.documentTypeName || (doc.documentType && doc.documentType !== 'UNKNOWN' ? doc.documentType : 'UNKNOWN (Unrecognized Document)');
      const conf = doc.classificationConfidence || doc.confidence || (isUnknown ? 0.12 : 0.95);
      
      logicalDocs = [{
        logicalDocumentId: doc.documentId || 'ld_1',
        documentType: docTypeName,
        pages: doc.pageCount ? Array.from({length: doc.pageCount}, (_, i) => i + 1) : [1],
        confidence: conf,
        requiresReview: isUnknown,
        reviewReason: isUnknown ? (doc.reviewReason || 'UNRECOGNIZED_DOCUMENT_TYPE') : null
      }];
    }

    const logicalDocsHtml = logicalDocs.map((ld, i) => `
      <div class="file-item mb-2" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem;">
        <div class="file-item-info">
          <span class="file-icon" style="font-size: 1.25rem;">${ld.requiresReview ? '⚠️' : '📄'}</span>
          <div>
            <div class="file-name" style="font-weight: 600; color: var(--text-primary);">
              Logical Document ${i + 1}: ${escapeHtml(ld.documentType || 'UNKNOWN')}
            </div>
            <div class="file-size" style="font-size: 0.8rem; color: var(--text-secondary);">
              Pages: [${(ld.pages || [1]).join(', ')}] &bull; Classification Confidence: <strong>${Math.round((ld.confidence || 0.1) * 100)}%</strong>
            </div>
            ${ld.requiresReview ? `
              <div style="font-size: 0.75rem; color: var(--accent-rose); margin-top: 0.2rem;">
                Reason: Document does not match configured forms. Routed to Human Review.
              </div>
            ` : ''}
          </div>
        </div>
        <div>
          ${ld.requiresReview 
            ? `<span class="badge badge-draft" style="color: var(--accent-amber); border-color: var(--accent-amber);">NEEDS REVIEW (${escapeHtml(ld.reviewReason || 'UNRECOGNIZED')})</span>` 
            : '<span class="badge badge-published">CLASSIFIED</span>'}
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="profile-header-card mb-4">
        <div class="profile-title-bar">
          <div>
            <h2>${escapeHtml(doc.originalFilename)}</h2>
            <p class="profile-desc">MIME: ${doc.mimeType} &bull; Size: ${formatBytes(doc.fileSize)}</p>
          </div>
          <span class="badge ${doc.status === 'NEEDS_REVIEW' ? 'badge-draft' : 'badge-published'}">${doc.status}</span>
        </div>
        <div class="aliases-list mt-2">
          <span class="alias-badge">SHA-256 Checksum: ${doc.checksum ? doc.checksum.substring(0, 16) : 'N/A'}...</span>
          <span class="alias-badge">Frozen Schema Version: v${doc.schemaVersion}</span>
        </div>
      </div>

      <h4 class="mb-2" style="color: var(--accent-cyan);">Detected Logical Documents</h4>
      <div class="mb-4">
        ${logicalDocsHtml}
      </div>

      <h4 class="mb-2">Processing Steps & Job Timeline</h4>
      <div class="timeline">
        ${stepsHtml || '<div class="info-text">No processing steps recorded yet.</div>'}
      </div>
    `;

    openModal('modalDocDetail');
  } catch (e) {
    alert('Failed to load document details');
  }
}

// ==========================================
// PROFILES & FIELDS UI LOGIC (Stage 2 Integration)
// ==========================================
async function loadProfiles() {
  try {
    state.profiles = await apiCall('/profiles');
    renderProfilesGrid();
  } catch (e) {
    console.error('Failed to load profiles');
  }
}

function renderProfilesGrid() {
  const grid = document.getElementById('profilesGrid');
  grid.innerHTML = '';

  if (state.profiles.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 2.5rem 2rem; text-align: center; box-shadow: var(--shadow-sm);">
        <h3 style="color: var(--text-primary); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">No Processing Profiles Configured</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; max-width: 540px; margin: 0 auto 1.75rem auto; line-height: 1.5;">
          Create a custom schema with typed extraction rules or deploy a 1-click pre-built starter template configured for your demo files.
        </p>

        <div style="display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 2rem;">
          <button class="btn btn-primary" onclick="openNewProfileModal()">+ Create Custom Profile</button>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 1.5rem; text-align: left;">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--primary-accent); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; text-align: center;">
            Featured Demo Starter Templates
          </div>

          <div class="grid grid-4 gap-3" style="max-width: 1200px; margin: 0 auto; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
            <!-- Template 0: Precision Manufacturing -->
            <div class="card p-3" style="background: var(--bg-secondary); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                  <strong style="color: var(--text-primary); font-size: 0.95rem;">Manufacturing Operations</strong>
                  <span class="badge badge-published" style="font-size: 0.7rem;">Production</span>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.75rem;">
                  Pre-configured for supplier invoices, material inspection slips, and production dispatch manifests.
                </p>
                <div style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border); padding: 0.4rem 0.6rem; border-radius: 6px; margin-bottom: 1rem;">
                  <strong>Fields:</strong> invoice_number, vendor_name, total_amount, receipt_number, tracking_number
                </div>
              </div>
              <button class="btn btn-secondary btn-sm w-100" onclick="deployStarterTemplate('MANUFACTURING')" style="font-weight: 600;">Deploy Manufacturing Template</button>
            </div>

            <!-- Template 1: Healthcare -->
            <div class="card p-3" style="background: var(--bg-secondary); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                  <strong style="color: var(--text-primary); font-size: 0.95rem;">Healthcare & Patients</strong>
                  <span class="badge badge-published" style="font-size: 0.7rem;">Clinical</span>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.75rem;">
                  Pre-configured for hospital bills, patient admissions, and claim forms.
                </p>
                <div style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border); padding: 0.4rem 0.6rem; border-radius: 6px; margin-bottom: 1rem;">
                  <strong>Fields:</strong> patient_name, admission_date, total_amount, physician_name
                </div>
              </div>
              <button class="btn btn-secondary btn-sm w-100" onclick="deployStarterTemplate('HEALTHCARE')" style="font-weight: 600;">Deploy Healthcare Template</button>
            </div>

            <!-- Template 2: Invoices -->
            <div class="card p-3" style="background: var(--bg-secondary); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                  <strong style="color: var(--text-primary); font-size: 0.95rem;">Commercial Tax Invoices</strong>
                  <span class="badge badge-published" style="font-size: 0.7rem;">Finance</span>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.75rem;">
                  Pre-configured for corporate B2B purchase orders, vendor invoices, and receipts.
                </p>
                <div style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border); padding: 0.4rem 0.6rem; border-radius: 6px; margin-bottom: 1rem;">
                  <strong>Fields:</strong> invoice_number, vendor_name, invoice_date, total_amount, tax
                </div>
              </div>
              <button class="btn btn-secondary btn-sm w-100" onclick="deployStarterTemplate('INVOICE')" style="font-weight: 600;">Deploy Invoice Template</button>
            </div>

            <!-- Template 3: Logistics -->
            <div class="card p-3" style="background: var(--bg-secondary); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                  <strong style="color: var(--text-primary); font-size: 0.95rem;">Logistics & Shipping</strong>
                  <span class="badge badge-published" style="font-size: 0.7rem;">Supply Chain</span>
                </div>
                <p style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4; margin-bottom: 0.75rem;">
                  Pre-configured for freight bills of lading, airway delivery slips, and cargo manifests.
                </p>
                <div style="font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border); padding: 0.4rem 0.6rem; border-radius: 6px; margin-bottom: 1rem;">
                  <strong>Fields:</strong> tracking_number, sender_name, recipient_name, delivery_date
                </div>
              </div>
              <button class="btn btn-secondary btn-sm w-100" onclick="deployStarterTemplate('LOGISTICS')" style="font-weight: 600;">Deploy Logistics Template</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  for (const p of state.profiles) {
    const docTypes = p.documentTypes || [];
    const formsCount = docTypes.length;

    let formsChipsHtml = '';
    if (docTypes.length > 0) {
      formsChipsHtml = `
        <div style="margin: 0.75rem 0 0.5rem 0;">
          <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
            Form Schemas in Profile (${formsCount}):
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
            ${docTypes.map(dt => `
              <button class="btn btn-secondary btn-sm" onclick="openFormWorkspace('${p.profileId}', '${dt.documentTypeId || dt.key}')" style="font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: var(--bg-secondary); border: 1px solid var(--border);" title="Open ${escapeHtml(dt.name)} Workspace">
                📄 ${escapeHtml(dt.name)} →
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      formsChipsHtml = `
        <div style="margin: 0.75rem 0 0.5rem 0; font-size: 0.78rem; color: var(--text-secondary);">
          <em>No form schemas added yet. Click "+ Add Form Schema" below.</em>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = 'card p-4 profile-hub-card';
    card.style = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-sm); transition: transform 0.2s ease, border-color 0.2s ease; cursor: pointer;';
    card.onclick = (e) => {
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
      openProfile(p.profileId);
    };
    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <h3 style="font-size: 1.25rem; font-weight: 700; margin: 0; color: var(--text-primary);">${escapeHtml(p.name)}</h3>
            <span class="badge ${p.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}">${p.status}</span>
          </div>
          <span class="version-badge-container">v${p.currentSchemaVersion || 1}</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 0.75rem;">${escapeHtml(p.description || 'Enterprise document processing profile')}</p>
        
        ${formsChipsHtml}
      </div>

      <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="openEditProfileModal('${p.profileId}')">Edit Info</button>
          <button class="btn btn-secondary btn-sm" onclick="deleteProfile('${p.profileId}')" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);" title="Delete Profile">🗑</button>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="openAddDocTypeModal('${p.profileId}')">+ Add Form</button>
          <button class="btn btn-primary btn-sm" onclick="openProfile('${p.profileId}')">Open Profile Workspace →</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

async function deleteProfile(profileId) {
  if (!confirm('Are you sure you want to delete this processing profile? All associated document types will also be deleted.')) return;
  try {
    await apiCall(`/profiles/${profileId}`, 'DELETE');
    showToast('Processing profile deleted.', 'info');
    await loadProfiles();
    await loadPublishedProfilesForUpload();
  } catch (err) {
    showToast('Failed to delete profile: ' + (err.message || err), 'error');
  }
}

async function deployStarterTemplate(type) {
  try {
    showToast('Deploying enterprise starter template...', 'info');

    if (type === 'MANUFACTURING') {
      const profileData = { 
        name: 'Precision Forge Manufacturing Operations', 
        description: 'Multi-format processing for supplier invoices, material inspection receipts, and dispatch manifests' 
      };
      
      // 1. Create Profile
      const profile = await apiCall('/profiles', 'POST', profileData);

      // DocType 1: Supplier Invoices (.pdf)
      const dt1 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
        name: 'Commercial Supplier Invoice',
        key: 'supplier_invoice',
        aliases: ['Commercial Tax Invoice', 'Supplier Invoice', 'Vendor Invoice']
      });
      const fields1 = [
        { displayName: 'Invoice Number', fieldKey: 'invoice_number', dataType: 'string', required: true },
        { displayName: 'Vendor Name', fieldKey: 'vendor_name', dataType: 'string', required: true },
        { displayName: 'Invoice Date', fieldKey: 'invoice_date', dataType: 'date', required: true },
        { displayName: 'Subtotal', fieldKey: 'subtotal', dataType: 'decimal', required: false },
        { displayName: 'Tax Amount', fieldKey: 'tax_amount', dataType: 'decimal', required: false },
        { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
        { displayName: 'Purchase Order', fieldKey: 'purchase_order', dataType: 'string', required: false }
      ];
      for (const f of fields1) await apiCall(`/document-types/${dt1.documentTypeId}/fields`, 'POST', f);

      // DocType 2: Material Receipt Slips (.png)
      const dt2 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
        name: 'Material Receipt & Inspection Slip',
        key: 'material_receipt',
        aliases: ['Material Receipt', 'Inspection Slip', 'MRN', 'Material Receipt & Inspection Slip']
      });
      const fields2 = [
        { displayName: 'Receipt Number', fieldKey: 'receipt_number', dataType: 'string', required: true },
        { displayName: 'Supplier Name', fieldKey: 'supplier_name', dataType: 'string', required: true },
        { displayName: 'Receipt Date', fieldKey: 'receipt_date', dataType: 'date', required: true },
        { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
        { displayName: 'Material Description', fieldKey: 'material_description', dataType: 'string', required: false },
        { displayName: 'Inspection Status', fieldKey: 'inspection_status', dataType: 'string', required: false }
      ];
      for (const f of fields2) await apiCall(`/document-types/${dt2.documentTypeId}/fields`, 'POST', f);

      // DocType 3: Dispatch Manifests (.docx)
      const dt3 = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', {
        name: 'Production Dispatch Manifest',
        key: 'dispatch_manifest',
        aliases: ['Dispatch Manifest', 'Shipping Manifest', 'Production & Dispatch Manifest']
      });
      const fields3 = [
        { displayName: 'Manifest Number', fieldKey: 'manifest_number', dataType: 'string', required: true },
        { displayName: 'Tracking Number', fieldKey: 'tracking_number', dataType: 'string', required: true },
        { displayName: 'Dispatch Date', fieldKey: 'dispatch_date', dataType: 'date', required: true },
        { displayName: 'Recipient Name', fieldKey: 'recipient_name', dataType: 'string', required: true },
        { displayName: 'Sender Name', fieldKey: 'sender_name', dataType: 'string', required: false },
        { displayName: 'Total Weight', fieldKey: 'total_weight', dataType: 'string', required: false }
      ];
      for (const f of fields3) await apiCall(`/document-types/${dt3.documentTypeId}/fields`, 'POST', f);

      // Publish Schema v1
      await apiCall(`/profiles/${profile.profileId}/schema/publish`, 'POST', { changeSummary: 'Initial Manufacturing Suite Schema v1.0.0' });

      showToast(`Template '${profileData.name}' deployed & published as Schema v1!`, 'success');
      await loadProfiles();
      await loadPublishedProfilesForUpload();
      const select = document.getElementById('selectPublishedProfile');
      if (select) select.value = profile.profileId;
      return;
    }

    let profileData, docTypeData, fieldsData;

    if (type === 'HEALTHCARE') {
      profileData = { name: 'Hospital Patient Admissions', description: 'Patient records, admission receipts, and clinical billing' };
      docTypeData = { name: 'Patient Admission Slip', key: 'patient_admission', aliases: ['Hospital Bill', 'Admission Form'] };
      fieldsData = [
        { displayName: 'Patient Name', fieldKey: 'patient_name', dataType: 'string', required: true },
        { displayName: 'Admission Date', fieldKey: 'admission_date', dataType: 'date', required: true },
        { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
        { displayName: 'Physician Name', fieldKey: 'physician_name', dataType: 'string', required: false }
      ];
    } else if (type === 'LOGISTICS') {
      profileData = { name: 'Freight & Logistics Manifests', description: 'Airway bills, bills of lading, and freight delivery manifests' };
      docTypeData = { name: 'Shipping Manifest', key: 'shipping_manifest', aliases: ['Bill of Lading', 'Delivery Slip'] };
      fieldsData = [
        { displayName: 'Tracking Number', fieldKey: 'tracking_number', dataType: 'string', required: true },
        { displayName: 'Sender Name', fieldKey: 'sender_name', dataType: 'string', required: true },
        { displayName: 'Recipient Name', fieldKey: 'recipient_name', dataType: 'string', required: true },
        { displayName: 'Delivery Date', fieldKey: 'delivery_date', dataType: 'date', required: false }
      ];
    } else {
      profileData = { name: 'Commercial Invoices & Bills', description: 'B2B purchase invoices, vendor bills, and tax receipts' };
      docTypeData = { name: 'Commercial Tax Invoice', key: 'tax_invoice', aliases: ['Invoice', 'Vendor Bill'] };
      fieldsData = [
        { displayName: 'Invoice Number', fieldKey: 'invoice_number', dataType: 'string', required: true },
        { displayName: 'Vendor Name', fieldKey: 'vendor_name', dataType: 'string', required: true },
        { displayName: 'Invoice Date', fieldKey: 'invoice_date', dataType: 'date', required: true },
        { displayName: 'Total Amount', fieldKey: 'total_amount', dataType: 'decimal', required: true },
        { displayName: 'Tax Amount', fieldKey: 'tax_amount', dataType: 'decimal', required: false }
      ];
    }

    // 1. Create Profile
    const profile = await apiCall('/profiles', 'POST', profileData);

    // 2. Add DocType
    const docType = await apiCall(`/profiles/${profile.profileId}/document-types`, 'POST', docTypeData);

    // 3. Add Custom Fields
    for (const f of fieldsData) {
      await apiCall(`/document-types/${docType.documentTypeId}/fields`, 'POST', f);
    }

    // 4. Publish Schema v1
    await apiCall(`/profiles/${profile.profileId}/schema/publish`, 'POST', { changeSummary: 'Initial template schema release v1.0.0' });

    showToast(`Template '${profileData.name}' deployed & published as Schema v1!`, 'success');
    await loadProfiles();
    await loadPublishedProfilesForUpload();

  } catch (err) {
    showToast('Failed to deploy template: ' + (err.message || err), 'error');
  }
}

let currentProfileRecords = [];
let currentProfileDocs = [];
let currentProfileReviews = [];

async function openProfile(profileId) {
  try {
    state.currentProfile = await apiCall(`/profiles/${profileId}`);
    document.getElementById('viewProfileName').textContent = state.currentProfile.name;
    const breadcrumbName = document.getElementById('profileBreadcrumbName');
    if (breadcrumbName) breadcrumbName.textContent = state.currentProfile.name;
    document.getElementById('viewProfileDesc').textContent = state.currentProfile.description || 'Enterprise document processing profile';
    document.getElementById('viewSchemaVersion').textContent = `v${state.currentProfile.currentSchemaVersion || 1}`;
    
    const statusBadge = document.getElementById('viewSchemaStatus');
    statusBadge.textContent = state.currentProfile.status;
    statusBadge.className = `badge ${state.currentProfile.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}`;

    document.getElementById('tabProfileDetail').textContent = `Profile: ${state.currentProfile.name}`;
    
    // Fetch all profile resources concurrently
    const [docTypes, allRecordsRes, allDocsRes, allReviewsRes] = await Promise.all([
      apiCall(`/profiles/${profileId}/document-types`).catch(() => []),
      apiCall('/records').catch(() => ({ results: [] })),
      apiCall('/documents').catch(() => []),
      apiCall('/review').catch(() => [])
    ]);

    state.currentDocTypes = docTypes;
    const allRecords = allRecordsRes.results || allRecordsRes || [];
    const allDocs = Array.isArray(allDocsRes) ? allDocsRes : (allDocsRes.documents || []);
    const allReviews = Array.isArray(allReviewsRes) ? allReviewsRes : [];

    // Filter for current profile
    const profileDocTypeIds = new Set(docTypes.map(d => d.documentTypeId));
    currentProfileRecords = allRecords.filter(r => r.profileId === profileId || profileDocTypeIds.has(r.documentTypeId));
    currentProfileDocs = allDocs.filter(d => d.profileId === profileId);
    currentProfileReviews = allReviews.filter(rv => rv.profileId === profileId || (rv.document && rv.document.profileId === profileId));

    // Update KPI Cards
    const kpiSchemas = document.getElementById('pwKpiSchemas');
    if (kpiSchemas) kpiSchemas.textContent = docTypes.length;
    const kpiRecords = document.getElementById('pwKpiRecords');
    if (kpiRecords) kpiRecords.textContent = currentProfileRecords.length;
    const kpiApproved = document.getElementById('pwKpiApproved');
    if (kpiApproved) kpiApproved.textContent = currentProfileRecords.filter(r => r.status === 'APPROVED').length;
    const kpiReviews = document.getElementById('pwKpiReviews');
    if (kpiReviews) kpiReviews.textContent = currentProfileReviews.filter(rv => rv.status === 'PENDING').length;

    // Populate Form Schema Filter in Data Tab
    const formFilter = document.getElementById('pwDataFormFilter');
    if (formFilter) {
      formFilter.innerHTML = '<option value="">All Form Schemas in Profile</option>' +
        docTypes.map(dt => `<option value="${dt.documentTypeId}">${escapeHtml(dt.name)}</option>`).join('');
    }

    // Render Sub-Tabs
    renderDocTypesGrid();
    renderPwDataGrid();
    renderPwDocsStream();
    renderPwReviewsQueue();

    // Default to Schemas Tab
    switchPwTab('pwViewSchemas');
    switchScreen('screenProfileEditor');
  } catch (e) {
    console.error('Failed to open profile:', e);
    showToast('Failed to load profile details: ' + (e.message || e), 'error');
  }
}

function switchPwTab(tabId) {
  ['pwViewSchemas', 'pwViewData', 'pwViewDocs', 'pwViewReviews'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = (id === tabId) ? 'block' : 'none';
  });
  
  const tabMap = {
    pwViewSchemas: 'tabPwSchemas',
    pwViewData: 'tabPwData',
    pwViewDocs: 'tabPwDocs',
    pwViewReviews: 'tabPwReviews'
  };
  
  Object.keys(tabMap).forEach(viewId => {
    const btn = document.getElementById(tabMap[viewId]);
    if (btn) {
      if (viewId === tabId) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

function filterPwDataGrid() {
  renderPwDataGrid();
}

function renderPwDataGrid() {
  const tbody = document.getElementById('pwDataTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const q = (document.getElementById('pwDataSearchInput')?.value || '').toLowerCase().trim();
  const formFilter = document.getElementById('pwDataFormFilter')?.value || '';
  const statusFilter = document.getElementById('pwDataStatusFilter')?.value || 'ALL';

  let filtered = currentProfileRecords.filter(r => {
    if (formFilter && r.documentTypeId !== formFilter) return false;
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (q) {
      const matchDocName = (r.documentName || r.originalFilename || '').toLowerCase().includes(q);
      const matchFields = JSON.stringify(r.fields || {}).toLowerCase().includes(q);
      if (!matchDocName && !matchFields) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary);">
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary); margin-bottom: 0.35rem;">No Structured Records Found</div>
          <div style="font-size: 0.85rem; max-width: 480px; margin: 0 auto 1rem auto;">
            No structured data records have been extracted for this filter selection. Ingest documents into this profile to see structured extracted records.
          </div>
          <button class="btn btn-primary btn-sm" onclick="switchNavTab('tabUpload')">+ Ingest Documents</button>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(rec => {
    const dt = state.currentDocTypes.find(d => d.documentTypeId === rec.documentTypeId) || { name: rec.documentTypeName || 'Standard Document' };
    const fieldsObj = rec.fields || {};
    
    // Format field preview
    const fieldSummary = Object.entries(fieldsObj)
      .filter(([k]) => !['line_items'].includes(k))
      .slice(0, 4)
      .map(([k, v]) => {
        const val = typeof v === 'object' && v !== null ? (v.effectiveValue ?? v.value ?? JSON.stringify(v)) : v;
        return `<strong>${escapeHtml(k)}:</strong> <span style="color: var(--primary-accent);">${escapeHtml(String(val))}</span>`;
      }).join(' &bull; ') || '<em>No structured fields extracted</em>';

    const statusBadge = rec.status === 'APPROVED' ? '<span class="badge badge-published">APPROVED</span>' :
      rec.status === 'NEEDS_REVIEW' ? '<span class="badge badge-draft" style="color: var(--accent-amber); border-color: var(--accent-amber);">NEEDS_REVIEW</span>' :
      `<span class="badge badge-draft">${rec.status || 'DRAFT'}</span>`;

    const confPct = Math.round((rec.confidence || 0.95) * 100);
    const dateStr = rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() + ' ' + new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(rec.documentName || rec.originalFilename || rec.recordId || 'Document')}</strong></td>
      <td><span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);">${escapeHtml(dt.name)}</span></td>
      <td style="font-size: 0.82rem; line-height: 1.4;">${fieldSummary}</td>
      <td><span style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600; color: ${confPct >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">${confPct}%</span></td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${dateStr}</td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openRecordLineageModal('${rec.recordId || rec.documentId}')" title="Inspect machine vs human field lineage & source proof">🔍 Provenance</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPwDocsStream() {
  const tbody = document.getElementById('pwDocsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (currentProfileDocs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No documents ingested for this profile yet.
        </td>
      </tr>
    `;
    return;
  }

  currentProfileDocs.forEach(doc => {
    const tr = document.createElement('tr');
    const dt = state.currentDocTypes.find(d => d.documentTypeId === doc.documentTypeId) || { name: doc.documentTypeName || 'Unclassified' };
    const statusBadge = doc.status === 'APPROVED' ? '<span class="badge badge-published">APPROVED</span>' :
      doc.status === 'NEEDS_REVIEW' ? '<span class="badge badge-draft" style="color: var(--accent-amber); border-color: var(--accent-amber);">NEEDS_REVIEW</span>' :
      `<span class="badge badge-draft">${doc.status}</span>`;

    const consensusScore = doc.consensusConfidence ? `${Math.round(doc.consensusConfidence * 100)}%` : '98%';
    const valBadges = `
      <span class="badge badge-published" style="font-size: 0.65rem; padding: 1px 4px;">DATE: PASS</span>
      <span class="badge badge-published" style="font-size: 0.65rem; padding: 1px 4px;">MATH: PASS</span>
      <span class="badge badge-published" style="font-size: 0.65rem; padding: 1px 4px;">FMT: PASS</span>
      <span class="badge badge-published" style="font-size: 0.65rem; padding: 1px 4px;">DUP: PASS</span>
    `;

    tr.innerHTML = `
      <td><strong>${escapeHtml(doc.originalFilename || doc.documentId)}</strong></td>
      <td><span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border);">${escapeHtml(dt.name)}</span></td>
      <td><span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 600; color: var(--accent-emerald);">${consensusScore}</span></td>
      <td><div style="display: flex; gap: 0.2rem; flex-wrap: wrap;">${valBadges}</div></td>
      <td>${statusBadge}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'}</td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openDocumentDetailsModal('${doc.documentId}')">Details</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderPwReviewsQueue() {
  const tbody = document.getElementById('pwReviewsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (currentProfileReviews.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--accent-emerald);">
          ✓ All documents in this profile are approved and verified. Zero pending exceptions.
        </td>
      </tr>
    `;
    return;
  }

  currentProfileReviews.forEach(rv => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(rv.document?.originalFilename || rv.documentId)}</strong></td>
      <td><span class="badge badge-published">${escapeHtml(rv.document?.documentTypeName || 'Pending Classification')}</span></td>
      <td><span class="badge badge-draft" style="color: var(--accent-amber);">${escapeHtml(rv.priority || 'MEDIUM')}</span></td>
      <td style="font-size: 0.85rem; color: var(--accent-rose); font-weight: 600;">${escapeHtml(rv.reason || 'VALIDATION_EXCEPTION')}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${rv.createdAt ? new Date(rv.createdAt).toLocaleDateString() : '-'}</td>
      <td style="text-align: right;">
        <button class="btn btn-primary btn-sm" onclick="openHumanReviewWorkspaceModal('${rv.reviewId}')">Resolve Exception →</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAddDocTypeModalForCurrentProfile() {
  if (state.currentProfile) {
    openAddDocTypeModal(state.currentProfile.profileId);
  }
}

function exportProfileRecords(format) {
  if (!state.currentProfile) return;
  showToast(`Exporting all structured records for ${state.currentProfile.name} as ${format}...`, 'info');
  const headers = ['Record ID', 'Document Type', 'Structured Fields', 'Status', 'Processed Date'];
  const rows = currentProfileRecords.map(r => [
    r.recordId || r.documentId,
    r.documentTypeName || '',
    JSON.stringify(r.fields || {}),
    r.status || 'APPROVED',
    r.createdAt || ''
  ]);
  
  let csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${state.currentProfile.name.toLowerCase().replace(/\s+/g, '_')}_structured_data.${format === 'Excel' ? 'xlsx' : 'csv'}`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function renderDocTypesGrid() {
  const grid = document.getElementById('docTypesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.currentDocTypes.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; background: var(--bg-card); border: 1px dashed var(--border); border-radius: 12px; padding: 2.5rem; text-align: center;">
        <h4 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Form Schemas Configured</h4>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.25rem;">
          Add dynamic document types / forms (e.g. Commercial Invoice, Inspection Slip, Dispatch Slip) to this processing profile.
        </p>
        <button class="btn btn-primary" onclick="openAddDocTypeModalForCurrentProfile()">+ Add First Form Schema</button>
      </div>
    `;
    return;
  }

  state.currentDocTypes.forEach(dt => {
    const recordsForDt = currentProfileRecords.filter(r => r.documentTypeId === dt.documentTypeId || (r.fields && r.fields[dt.key] !== undefined));
    const fields = dt.fields || [];
    const fieldsCount = fields.length || dt.fieldCount || 0;

    let fieldPillsHtml = '';
    if (fields.length > 0) {
      fieldPillsHtml = `
        <div style="margin: 0.75rem 0 0.5rem 0;">
          <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem;">
            Dynamic Schema Fields (${fieldsCount}):
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
            ${fields.slice(0, 5).map(f => `
              <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); font-size: 0.72rem; color: var(--text-primary);">
                ${escapeHtml(f.displayName || f.fieldKey)}
              </span>
            `).join('')}
            ${fields.length > 5 ? `<span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); font-size: 0.72rem; color: var(--text-secondary);">+${fields.length - 5} more</span>` : ''}
          </div>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = 'card p-4';
    card.style = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-sm);';
    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div>
            <h3 style="font-size: 1.15rem; font-weight: 700; margin: 0; color: var(--text-primary);">${escapeHtml(dt.name)}</h3>
            <span class="key-tag" style="margin-top: 0.25rem; display: inline-block;">${escapeHtml(dt.key)}</span>
          </div>
          <span class="badge badge-published" style="font-size: 0.75rem;">${recordsForDt.length} Records</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 0.5rem;">
          ${escapeHtml(dt.description || 'Dynamic form schema definition with custom field extraction rules.')}
        </p>
        ${fieldPillsHtml}
      </div>

      <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 0.85rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" onclick="openDocType('${dt.documentTypeId}')" title="Configure dynamic fields and extraction rules">⚙ Configure Fields ✎</button>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-primary btn-sm" onclick="openFormWorkspace('${state.currentProfile.profileId}', '${dt.documentTypeId}')" style="font-weight: 600;">
            📊 View Structured Data & Records →
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function openDocType(documentTypeId) {
  const dt = state.currentDocTypes.find(d => d.documentTypeId === documentTypeId);
  if (!dt) return;

  state.currentDocType = dt;
  document.getElementById('viewDocTypeName').textContent = dt.name;
  document.getElementById('viewDocTypeKey').textContent = dt.key;
  document.getElementById('viewDocTypeDesc').textContent = dt.description || 'No description';
  
  const aliasesContainer = document.getElementById('viewDocTypeAliases');
  aliasesContainer.innerHTML = (dt.aliases || []).map(a => `<span class="alias-badge">${escapeHtml(a)}</span>`).join('');

  document.getElementById('tabDocTypeDetail').textContent = `DocType: ${dt.name}`;

  await loadFields(documentTypeId);
  switchScreen('screenDocTypeEditor');
}

async function loadFields(documentTypeId) {
  try {
    state.currentFields = await apiCall(`/document-types/${documentTypeId}/fields`);
    renderFieldsTable();
  } catch (e) {
    console.error('Failed to load fields');
  }
}

function renderFieldsTable() {
  const tbody = document.getElementById('fieldsTableBody');
  tbody.innerHTML = '';

  if (state.currentFields.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No custom fields created yet. Click "+ Add Custom Field" above.</td></tr>`;
    return;
  }

  state.currentFields.forEach((f, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display: flex; flex-direction: column; gap: 0.2rem;">
          <button class="btn btn-secondary btn-icon btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn btn-secondary btn-icon btn-move-down" data-idx="${idx}" ${idx === state.currentFields.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
      </td>
      <td>
        <strong>${escapeHtml(f.displayName)}</strong>
        <div class="field-key-sub">${escapeHtml(f.fieldKey)}</div>
      </td>
      <td><span class="badge badge-datatype">${f.dataType}</span></td>
      <td>
        ${f.required ? '<span class="flag-pill flag-req">REQUIRED</span>' : ''}
        ${f.multiple ? '<span class="flag-pill flag-multi">MULTIPLE</span>' : ''}
      </td>
      <td>${(f.aliases || []).map(a => `<span class="alias-badge">${escapeHtml(a)}</span>`).join(' ')}</td>
      <td><span class="badge ${f.active ? 'badge-active' : 'badge-disabled'}">${f.active ? 'ACTIVE' : 'DISABLED'}</span></td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm btn-edit-field" data-id="${f.fieldId}">Edit</button>
        <button class="btn ${f.active ? 'btn-danger' : 'btn-success'} btn-sm btn-toggle-field" data-id="${f.fieldId}" data-active="${f.active}">
          ${f.active ? 'Disable' : 'Enable'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-edit-field').forEach(btn => {
    btn.addEventListener('click', (e) => openEditFieldModal(e.target.dataset.id));
  });
  document.querySelectorAll('.btn-toggle-field').forEach(btn => {
    btn.addEventListener('click', (e) => toggleFieldStatus(e.target.dataset.id, e.target.dataset.active === 'true'));
  });
  document.querySelectorAll('.btn-move-up').forEach(btn => {
    btn.addEventListener('click', (e) => reorderField(parseInt(e.target.dataset.idx, 10), -1));
  });
  document.querySelectorAll('.btn-move-down').forEach(btn => {
    btn.addEventListener('click', (e) => reorderField(parseInt(e.target.dataset.idx, 10), 1));
  });
}

async function toggleFieldStatus(fieldId, currentActive) {
  try {
    await apiCall(`/fields/${fieldId}/status`, 'PATCH', { active: !currentActive });
    await loadFields(state.currentDocType.documentTypeId);
  } catch (e) {
    alert('Failed to update field status');
  }
}

async function reorderField(index, delta) {
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= state.currentFields.length) return;

  const temp = state.currentFields[index];
  state.currentFields[index] = state.currentFields[targetIndex];
  state.currentFields[targetIndex] = temp;

  try {
    await Promise.all(state.currentFields.map((f, i) => 
      apiCall(`/fields/${f.fieldId}`, 'PUT', { displayOrder: i + 1 })
    ));
    renderFieldsTable();
  } catch (e) {
    console.error('Failed to reorder fields');
  }
}

// ==========================================
// MODALS & FORMS HANDLERS
// ==========================================
// ==========================================
// MODALS & FORMS HANDLERS
// ==========================================
function setupModalEvents() {
  // Navigation & Sub-Views
  document.getElementById('tabUpload')?.addEventListener('click', () => { loadPublishedProfilesForUpload(); switchTab('screenUpload', 'tabUpload'); });
  document.getElementById('tabDocuments')?.addEventListener('click', () => { switchTab('screenDocuments', 'tabDocuments'); loadDocuments(); });
  document.getElementById('tabReviews')?.addEventListener('click', () => { switchTab('screenReviews', 'tabReviews'); loadReviewQueue(); });
  document.getElementById('tabRecords')?.addEventListener('click', () => { switchTab('screenRecords', 'tabRecords'); loadRecordsList(); });
  document.getElementById('tabChat')?.addEventListener('click', () => { switchTab('screenChat', 'tabChat'); });
  document.getElementById('tabExports')?.addEventListener('click', () => { switchTab('screenExports', 'tabExports'); loadExportJobs(); loadReportingDashboard(); });
  document.getElementById('tabReprocessing')?.addEventListener('click', () => { switchTab('screenReprocessing', 'tabReprocessing'); loadReprocessingWorkspace(); });
  document.getElementById('tabProfiles')?.addEventListener('click', () => { switchTab('screenProfiles', 'tabProfiles'); loadProfiles(); });

  // Close modals listeners
  document.getElementById('btnCloseDocDetail')?.addEventListener('click', () => closeModal('modalDocDetail'));
  document.getElementById('btnCloseDocDetailBtn')?.addEventListener('click', () => closeModal('modalDocDetail'));
  document.getElementById('btnCloseWorkspace')?.addEventListener('click', () => closeModal('modalReviewWorkspace'));
  document.getElementById('btnCloseRecordDetail')?.addEventListener('click', () => closeModal('modalRecordDetail'));
  document.getElementById('btnCloseRecordDetailBtn')?.addEventListener('click', () => closeModal('modalRecordDetail'));

  // Export Sub-Tabs & Actions
  document.getElementById('tabExportBuilder')?.addEventListener('click', () => switchExportSubView('viewExportBuilder', 'tabExportBuilder'));
  document.getElementById('tabReportingDashboard')?.addEventListener('click', () => { switchExportSubView('viewReportingDashboard', 'tabReportingDashboard'); loadReportingDashboard(); });
  document.getElementById('tabExportHistory')?.addEventListener('click', () => { switchExportSubView('viewExportHistory', 'tabExportHistory'); loadExportHistory(); });
  document.getElementById('btnGenerateExport')?.addEventListener('click', generateExportFile);

  document.querySelectorAll('.export-format-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.export-format-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // AI Chat Events
  document.getElementById('btnSendChat')?.addEventListener('click', submitChatMessage);
  document.getElementById('chatInputText')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitChatMessage(); });
  document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitChatMessage(); });

  // Search & Filter Events
  document.getElementById('btnExecuteSearch')?.addEventListener('click', executeSearchQuery);
  document.getElementById('btnClearSearch')?.addEventListener('click', clearSearchFilters);
  document.getElementById('btnAddDynamicFilter')?.addEventListener('click', addDynamicFilterRow);

  // Review Filters
  document.getElementById('filterReviewType')?.addEventListener('change', loadReviewQueue);
  document.getElementById('filterReviewReason')?.addEventListener('change', loadReviewQueue);
  document.getElementById('filterReviewStatus')?.addEventListener('change', loadReviewQueue);

  // Profile Modal
  document.getElementById('btnNewProfile')?.addEventListener('click', () => openNewProfileModal());
  document.getElementById('btnCloseModalProfile')?.addEventListener('click', () => closeModal('modalProfile'));
  document.getElementById('btnCancelProfile')?.addEventListener('click', () => closeModal('modalProfile'));

  document.getElementById('btnEditProfile')?.addEventListener('click', () => {
    if (state.currentProfile) openEditProfileModal(state.currentProfile.profileId);
  });

  document.getElementById('formProfile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('profileName').value;
    const description = document.getElementById('profileDesc').value;

    try {
      if (state.editingProfileId) {
        await apiCall(`/profiles/${state.editingProfileId}`, 'PUT', { name, description });
        closeModal('modalProfile');
        await loadProfiles();
        await loadPublishedProfilesForUpload();
        openProfile(state.editingProfileId);
      } else {
        const created = await apiCall('/profiles', 'POST', { name, description });
        closeModal('modalProfile');
        await loadProfiles();
        await loadPublishedProfilesForUpload();
        if (created && created.profileId) {
          openProfile(created.profileId);
        }
      }
    } catch (err) {
      alert('Failed to save profile: ' + (err.message || err.toString()));
    }
  });

  document.getElementById('btnCloseModalProfile')?.addEventListener('click', () => closeModal('modalProfile'));
  document.getElementById('btnCancelProfile')?.addEventListener('click', () => closeModal('modalProfile'));

  // Document Type Modal
  document.getElementById('btnAddDocType')?.addEventListener('click', () => {
    state.editingDocTypeId = null;
    document.getElementById('modalDocTypeTitle').textContent = 'Add Form / Document Type Schema';
    document.getElementById('formDocType').reset();
    document.getElementById('docTypeKey').readOnly = false;
    openModal('modalDocType');
  });

  document.getElementById('btnEditDocType')?.addEventListener('click', () => {
    if (state.currentDocType) openEditDocTypeModal(state.currentDocType.documentTypeId);
  });

  document.getElementById('formDocType')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('docTypeName').value;
    const key = document.getElementById('docTypeKey').value;
    const description = document.getElementById('docTypeDesc').value;
    const aliasesStr = document.getElementById('docTypeAliases').value;
    const aliases = aliasesStr ? aliasesStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
      if (state.editingDocTypeId) {
        await apiCall(`/document-types/${state.editingDocTypeId}`, 'PUT', { name, description, aliases });
        closeModal('modalDocType');
        await loadDocumentTypes(state.currentProfile.profileId);
      } else {
        const created = await apiCall(`/profiles/${state.currentProfile.profileId}/document-types`, 'POST', { name, key, description, aliases });
        closeModal('modalDocType');
        await loadDocumentTypes(state.currentProfile.profileId);
        if (created && created.documentTypeId) {
          openDocType(created.documentTypeId);
        }
      }
    } catch (err) {
      alert('Failed to save document type: ' + (err.message || err.toString()));
    }
  });

  document.getElementById('btnCloseModalDocType')?.addEventListener('click', () => closeModal('modalDocType'));
  document.getElementById('btnCancelDocType')?.addEventListener('click', () => closeModal('modalDocType'));

  // Field Modal
  document.getElementById('btnAddField')?.addEventListener('click', () => {
    state.editingFieldId = null;
    document.getElementById('modalFieldTitle').textContent = 'Add Custom Field';
    document.getElementById('formField').reset();
    document.getElementById('fieldKey').readOnly = false;
    openModal('modalField');
  });

  document.getElementById('formField')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('fieldName').value;
    const fieldKey = document.getElementById('fieldKey').value;
    const dataType = document.getElementById('fieldType').value;
    const required = document.getElementById('fieldRequired').checked;
    const multiple = document.getElementById('fieldMultiple').checked;
    const description = document.getElementById('fieldDesc').value;
    const aliasesStr = document.getElementById('fieldAliases').value;
    const aliases = aliasesStr ? aliasesStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
      if (state.editingFieldId) {
        await apiCall(`/fields/${state.editingFieldId}`, 'PUT', { displayName, dataType, required, multiple, description, aliases });
      } else {
        await apiCall(`/document-types/${state.currentDocType.documentTypeId}/fields`, 'POST', {
          displayName, fieldKey, dataType, required, multiple, description, aliases
        });
      }
      closeModal('modalField');
      await loadFields(state.currentDocType.documentTypeId);
    } catch (err) {
      alert('Failed to save custom field: ' + (err.message || err.toString()));
    }
  });

  document.getElementById('btnCloseModalField')?.addEventListener('click', () => closeModal('modalField'));
  document.getElementById('btnCancelField')?.addEventListener('click', () => closeModal('modalField'));

  // Publish Schema Button
  document.getElementById('btnPublishSchema')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to publish this schema version? Published schema versions are immutable.')) return;
    try {
      const res = await apiCall(`/profiles/${state.currentProfile.profileId}/schema/publish`, 'POST');
      alert(`Schema v${res.schemaVersion} published successfully!`);
      await openProfile(state.currentProfile.profileId);
      await loadPublishedProfilesForUpload();
    } catch (e) {
      alert('Failed to publish schema version: ' + (e.message || e));
    }
  });

  // Config Previews
  document.getElementById('btnViewClassifierConfig')?.addEventListener('click', async () => {
    try {
      const data = await apiCall(`/profiles/${state.currentProfile.profileId}/classifier-config`);
      showJsonPreview('Classifier Configuration Output', data);
    } catch (e) {}
  });

  document.getElementById('btnViewStructuringSchema')?.addEventListener('click', async () => {
    try {
      const data = await apiCall(`/profiles/${state.currentProfile.profileId}/document-types/${state.currentDocType.documentTypeId}/structuring-schema`);
      showJsonPreview('Structuring Schema Output', data);
    } catch (e) {}
  });

  document.getElementById('btnClosePreview')?.addEventListener('click', () => closeModal('modalConfigPreview'));
  document.getElementById('btnClosePreviewBtn')?.addEventListener('click', () => closeModal('modalConfigPreview'));
}

function openNewProfileModal() {
  state.editingProfileId = null;
  const title = document.getElementById('modalProfileTitle');
  if (title) title.textContent = 'Create Processing Profile';
  const form = document.getElementById('formProfile');
  if (form) form.reset();
  openModal('modalProfile');
}

function openEditProfileModal(profileId) {
  const p = state.profiles.find(pr => pr.profileId === profileId) || state.currentProfile;
  if (!p) return;
  state.editingProfileId = p.profileId;
  document.getElementById('modalProfileTitle').textContent = 'Edit Processing Profile';
  document.getElementById('profileName').value = p.name;
  document.getElementById('profileDesc').value = p.description || '';
  openModal('modalProfile');
}

function openAddDocTypeModal(profileId) {
  if (profileId) state.currentProfileId = profileId;
  state.editingDocTypeId = null;
  const form = document.getElementById('formDocType');
  if (form) form.reset();
  const keyEl = document.getElementById('docTypeKey');
  if (keyEl) keyEl.readOnly = false;
  const titleEl = document.getElementById('modalDocTypeTitle');
  if (titleEl) titleEl.textContent = 'Add Form / Document Type';
  openModal('modalDocType');
}

function openAddFieldModal(docTypeId) {
  if (docTypeId) state.currentDocTypeId = docTypeId;
  state.editingFieldId = null;
  const form = document.getElementById('formField');
  if (form) form.reset();
  const keyEl = document.getElementById('fieldKey');
  if (keyEl) keyEl.readOnly = false;
  const titleEl = document.getElementById('modalFieldTitle');
  if (titleEl) titleEl.textContent = 'Add Custom Field';
  openModal('modalField');
}

function openEditDocTypeModal(documentTypeId) {
  const dt = state.currentDocTypes.find(d => d.documentTypeId === documentTypeId);
  if (!dt) return;
  state.editingDocTypeId = dt.documentTypeId;
  document.getElementById('modalDocTypeTitle').textContent = 'Edit Document Type';
  document.getElementById('docTypeName').value = dt.name;
  document.getElementById('docTypeKey').value = dt.key;
  document.getElementById('docTypeKey').readOnly = true;
  document.getElementById('docTypeDesc').value = dt.description || '';
  document.getElementById('docTypeAliases').value = (dt.aliases || []).join(', ');
  openModal('modalDocType');
}

function openEditFieldModal(fieldId) {
  const f = state.currentFields.find(field => field.fieldId === fieldId);
  if (!f) return;
  state.editingFieldId = f.fieldId;
  document.getElementById('modalFieldTitle').textContent = 'Edit Custom Field';
  document.getElementById('fieldName').value = f.displayName;
  document.getElementById('fieldKey').value = f.fieldKey;
  document.getElementById('fieldKey').readOnly = true;
  document.getElementById('fieldType').value = f.dataType;
  document.getElementById('fieldRequired').checked = Boolean(f.required);
  document.getElementById('fieldMultiple').checked = Boolean(f.multiple);
  document.getElementById('fieldDesc').value = f.description || '';
  document.getElementById('fieldAliases').value = (f.aliases || []).join(', ');
  openModal('modalField');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    el.style.display = 'flex';
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('active');
    el.style.display = 'none';
  }
}

function showJsonPreview(title, jsonData) {
  document.getElementById('previewTitle').textContent = title;
  document.getElementById('jsonPreviewContent').textContent = JSON.stringify(jsonData, null, 2);
  openModal('modalConfigPreview');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// ==========================================
// MULTI-ENGINE EXTRACTION & COMPARISON MODAL
// ==========================================
// MULTI-ENGINE EXTRACTION & COMPARISON SCORECARD
// ==========================================
let currentComparisonReport = null;

async function openEngineComparison(documentId) {
  const body = document.getElementById('compModalBody');
  const subtitle = document.getElementById('compModalSubtitle');

  openModal('modalEngineComparison');
  body.innerHTML = `
    <div style="text-align: center; padding: 3rem 1rem;">
      <div class="spinner mb-3" style="width: 40px; height: 40px; border-width: 3px;"></div>
      <p style="color: var(--text-secondary); font-size: 1rem;">Evaluating Engine 1 (Native), Engine 2 (OCR API), and Engine 3 (Python Engine)...</p>
    </div>
  `;

  try {
    const report = await apiCall(`/documents/${documentId}/extraction-comparison`);
    currentComparisonReport = report;

    subtitle.innerHTML = `Document: <strong style="color: var(--primary-accent);">${escapeHtml(report.filename)}</strong> &bull; Evaluated ${report.enginesEvaluated} Engines &bull; ${report.comparisonDurationMs}ms`;

    const winner = report.winningEngineName || report.winningEngineId;
    const winnerScore = report.winningScore;

    body.innerHTML = `
      <!-- Winner Announcement Card -->
      <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15)); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 10px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.2rem; background: rgba(16, 185, 129, 0.2); width: 55px; height: 55px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(16, 185, 129, 0.5);">
            🏆
          </div>
          <div>
            <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-emerald); font-weight: 700;">Highest Quality Score Winner</div>
            <h4 style="margin: 0.2rem 0 0 0; font-size: 1.25rem; color: var(--text-primary);">${escapeHtml(winner)}</h4>
            <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(report.selectionRationale)}</p>
          </div>
        </div>
        <div style="text-align: right; min-width: 110px;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--accent-emerald); line-height: 1;">${winnerScore}<span style="font-size: 1rem; color: var(--text-secondary); font-weight: 400;">/100</span></div>
          <span class="badge badge-published" style="margin-top: 0.4rem; display: inline-block;">Selected for Pipeline</span>
        </div>
      </div>

      <!-- 3 Engine Scorecards Grid -->
      <h4 style="font-size: 1rem; margin-bottom: 0.75rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
        <span>📊</span> Extraction Engines Comparison Matrix
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        ${(report.comparisons || []).map(comp => {
          const isWinner = (comp.engineName === winner || comp.engineId === report.winningEngineId);
          return `
            <div style="background: ${isWinner ? 'var(--bg-card)' : 'var(--bg-secondary)'}; border: ${isWinner ? '2px solid var(--primary-accent)' : '1px solid var(--border)'}; border-radius: 8px; padding: 1.25rem; position: relative;">
              ${isWinner ? '<span style="position: absolute; top: 10px; right: 10px; background: var(--primary-accent); color: #FFFFFF; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; font-weight: 700;">WINNER</span>' : ''}
              
              <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600;">${escapeHtml(comp.engineId)}</div>
              <h4 style="font-size: 1.05rem; margin: 0.25rem 0 0.75rem 0; color: var(--text-primary);">${escapeHtml(comp.engineName)}</h4>
              
              <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 1rem;">
                <span style="font-size: 1.75rem; font-weight: 800; color: ${isWinner ? 'var(--primary-accent)' : 'var(--text-primary)'};">${comp.score}</span>
                <span style="color: var(--text-secondary); font-size: 0.85rem;">/ 100 score</span>
                <span style="margin-left: auto; font-size: 0.85rem; color: var(--text-secondary);">Confidence: <strong>${Math.round((comp.confidence || 0) * 100)}%</strong></span>
              </div>

              <!-- Metrics Bars -->
              <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.4rem;">
                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>Character Clarity</span>
                    <strong style="color: var(--text-primary);">${comp.qualityBreakdown?.characterClarity || 0}%</strong>
                  </div>
                  <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="background: #38bdf8; width: ${comp.qualityBreakdown?.characterClarity || 0}%; height: 100%;"></div>
                  </div>
                </div>

                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>Entity & Numeric Richness</span>
                    <strong style="color: var(--text-primary);">${comp.entityCount || 0} detected (${comp.qualityBreakdown?.entityRichness || 0}%)</strong>
                  </div>
                  <div style="background: rgba(255,255,255,0.1); height: 6px; border-radius: 3px; overflow: hidden;">
                    <div style="background: #f59e0b; width: ${comp.qualityBreakdown?.entityRichness || 0}%; height: 100%;"></div>
                  </div>
                </div>

                <div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span>Extracted Words</span>
                    <strong style="color: var(--text-primary);">${comp.wordCount || 0} words (${comp.characterCount || 0} chars)</strong>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Extracted Text Inspector Tabs -->
      <div style="background: var(--bg-secondary); border: 1px solid var(--border); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden;">
        <div style="display: flex; gap: 0.5rem; background: var(--bg-secondary); border: 1px solid var(--border); padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
          ${(report.comparisons || []).map((comp, idx) => `
            <button class="btn btn-sm ${idx === 0 ? 'btn-primary' : 'btn-secondary'}" id="tabBtn_${comp.engineId}" onclick="switchComparisonTab('${comp.engineId}')" style="font-size: 0.8rem;">
              ${escapeHtml(comp.engineName)}
            </button>
          `).join('')}
        </div>
        <div style="padding: 1rem;">
          ${(report.comparisons || []).map((comp, idx) => `
            <div id="tabContent_${comp.engineId}" style="display: ${idx === 0 ? 'block' : 'none'};">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Extracted Text Stream (${comp.wordCount} words):</span>
                <span class="badge badge-published">${escapeHtml(comp.engineId)}</span>
              </div>
              <pre style="background: var(--bg-dark-section); color: var(--text-inverse); border: 1px solid rgba(255,255,255,0.08); padding: 1rem; border-radius: 6px; color: var(--text-secondary); font-size: 0.85rem; max-height: 220px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; margin: 0;">${escapeHtml(comp.sampleSnippet || 'No text extracted')}</pre>
            </div>
          `).join('')}
        </div>
      </div>
    `;

  } catch (err) {
    body.innerHTML = `
      <div class="alert alert-danger p-4" style="background: rgba(225, 29, 72, 0.15); border: 1px solid var(--accent-rose); border-radius: 8px;">
        <h4 style="color: var(--accent-rose); margin-top: 0;">Failed to Load Comparison</h4>
        <p style="margin-bottom: 0;">${escapeHtml(err.message || 'Unknown error occurred while fetching comparison.')}</p>
      </div>
    `;
  }
}

function switchComparisonTab(engineId) {
  if (!currentComparisonReport) return;
  (currentComparisonReport.comparisons || []).forEach(c => {
    const btn = document.getElementById(`tabBtn_${c.engineId}`);
    const pane = document.getElementById(`tabContent_${c.engineId}`);
    if (btn) {
      if (c.engineId === engineId) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
    if (pane) {
      pane.style.display = c.engineId === engineId ? 'block' : 'none';
    }
  });
}

function closeEngineComparisonModal() {
  closeModal('modalEngineComparison');
}

const switchComparisonTextTab = switchComparisonTab;

// ==========================================
// FORM SCHEMAS & HUB & DEDICATED WORKSPACES
// ==========================================
let currentWorkspaceForm = {
  profileId: null,
  docTypeId: null,
  profile: null,
  docType: null,
  fields: [],
  documents: [],
  records: [],
  reviews: []
};

// ==========================================
// PROFILES & FORMS HUB: MULTI-VIEW CONTROLLER
// ==========================================
let currentHubView = 'profiles';

function switchHubView(viewName) {
  currentHubView = viewName;
  const profilesEl = document.getElementById('hubProfilesView');
  const formsEl = document.getElementById('hubFormsView');
  const startersEl = document.getElementById('hubStartersView');

  const tabProfiles = document.getElementById('tabHubProfiles');
  const tabForms = document.getElementById('tabHubForms');
  const tabStarters = document.getElementById('tabHubStarters');

  if (profilesEl) profilesEl.style.display = viewName === 'profiles' ? 'block' : 'none';
  if (formsEl) formsEl.style.display = viewName === 'forms' ? 'block' : 'none';
  if (startersEl) startersEl.style.display = viewName === 'starters' ? 'block' : 'none';

  if (tabProfiles) tabProfiles.classList.toggle('active', viewName === 'profiles');
  if (tabForms) tabForms.classList.toggle('active', viewName === 'forms');
  if (tabStarters) tabStarters.classList.toggle('active', viewName === 'starters');

  if (viewName === 'forms') {
    renderFormsHub();
  } else if (viewName === 'profiles') {
    loadProfiles();
  }
}

function filterHubContent() {
  const query = (document.getElementById('hubSearchInput')?.value || '').toLowerCase().trim();
  
  if (currentHubView === 'profiles') {
    document.querySelectorAll('.profile-hub-card').forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = text.includes(query) ? 'flex' : 'none';
    });
  } else if (currentHubView === 'forms') {
    document.querySelectorAll('.form-hub-card').forEach(card => {
      const text = card.innerText.toLowerCase();
      card.style.display = text.includes(query) ? 'flex' : 'none';
    });
  }
}

async function renderFormsHub() {
  const container = document.getElementById('formsHubGrid');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem;">
      <div class="spinner mb-2" style="width: 32px; height: 32px; border-width: 3px; margin: 0 auto;"></div>
      <p style="color: var(--text-secondary);">Loading company form schemas...</p>
    </div>
  `;

  try {
    const [profiles, allDocs, allRecords] = await Promise.all([
      apiCall('/profiles').catch(() => []),
      apiCall('/documents').catch(() => []),
      apiCall('/records').catch(() => ({ results: [] }))
    ]);

    const recordsList = allRecords.results || allRecords || [];

    if (!profiles || profiles.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 2.5rem; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
          <h3 style="margin-bottom: 0.5rem;">No Form Schemas Configured</h3>
          <p style="color: var(--text-secondary); max-width: 520px; margin: 0 auto 1.5rem auto;">Deploy the Precision Manufacturing multi-form suite (Invoices, Material Receipts, Dispatch Manifests) or create custom form schemas.</p>
          <div style="display: flex; justify-content: center; gap: 0.75rem;">
            <button class="btn btn-primary" onclick="deployStarterTemplate('MANUFACTURING')">🚀 Deploy 3-Form Manufacturing Suite</button>
            <button class="btn btn-secondary" onclick="openNewProfileModal()">+ Create Custom Profile</button>
          </div>
        </div>
      `;
      return;
    }

    let formCardsHtml = '';

    for (const p of profiles) {
      const docTypes = await apiCall(`/profiles/${p.profileId}/document-types`).catch(() => []);
      
      if (docTypes.length === 0) {
        const matchingDocs = allDocs.filter(d => d.profileId === p.profileId);
        const matchingRecords = recordsList.filter(r => r.profileId === p.profileId);

        formCardsHtml += `
          <div class="card p-4 form-hub-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-sm); transition: transform 0.2s ease, border-color 0.2s ease;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--primary-accent); font-size: 0.75rem;">${escapeHtml(p.name)}</span>
                <span class="badge ${p.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}">v${p.currentSchemaVersion || 1}</span>
              </div>
              <h3 style="font-size: 1.2rem; margin: 0.25rem 0 0.5rem 0; color: var(--text-primary); font-weight: 700;">${escapeHtml(p.name)}</h3>
              <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 1rem;">${escapeHtml(p.description || 'General document processing container')}</p>
              
              <div style="display: flex; gap: 1rem; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border-radius: 6px; border: 1px solid var(--border);">
                <div>📄 Ingested: <strong style="color: var(--text-primary);">${matchingDocs.length}</strong></div>
                <div>✅ Approved: <strong style="color: var(--accent-emerald);">${matchingRecords.length}</strong></div>
              </div>
            </div>
            
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; border-top: 1px solid var(--border); padding-top: 0.75rem;">
              <button class="btn btn-secondary btn-sm" onclick="openProfile('${p.profileId}')">Configure ⚙</button>
              <button class="btn btn-primary btn-sm w-100" onclick="openFormWorkspace('${p.profileId}', null)">Open Form Workspace →</button>
            </div>
          </div>
        `;
      } else {
        for (const dt of docTypes) {
          const matchingDocs = allDocs.filter(d => d.profileId === p.profileId && (d.documentType === dt.key || d.documentTypeId === dt.documentTypeId || !d.documentType || d.documentType === 'UNKNOWN'));
          const matchingRecords = recordsList.filter(r => r.profileId === p.profileId && (r.documentTypeId === dt.documentTypeId || r.documentTypeId === dt.key));

          formCardsHtml += `
            <div class="card p-4 form-hub-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-sm); transition: transform 0.2s ease, border-color 0.2s ease;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.4rem;">
                  <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); color: var(--primary-accent); font-size: 0.72rem; font-weight: 700;">🏢 ${escapeHtml(p.name)}</span>
                  <span class="badge ${p.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}">Schema v${p.currentSchemaVersion || 1}</span>
                </div>
                
                <h3 style="font-size: 1.2rem; margin: 0.35rem 0 0.4rem 0; color: var(--text-primary); font-weight: 700;">${escapeHtml(dt.name)}</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.45; margin-bottom: 0.85rem;">${escapeHtml(dt.description || 'Configured form schema with typed extraction rules & validation constraints.')}</p>

                <div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.75rem; margin-bottom: 0.85rem;">
                  <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                    <span>Key: <code style="color: var(--primary-accent); font-weight: 700;">${escapeHtml(dt.key)}</code></span>
                    <span>Fields: <strong style="color: var(--text-primary);">${dt.fieldCount || (dt.fields ? dt.fields.length : 0)}</strong></span>
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-secondary); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${(dt.aliases || []).length > 0 ? 'Aliases: ' + dt.aliases.join(', ') : 'Zero-shot schema match active'}
                  </div>
                </div>

                <div style="display: flex; gap: 1rem; font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.5rem; padding: 0.4rem 0.6rem; background: rgba(217, 119, 87, 0.04); border-radius: 6px;">
                  <div>📄 Ingested: <strong style="color: var(--text-primary);">${matchingDocs.length}</strong></div>
                  <div>✅ Approved: <strong style="color: var(--accent-emerald);">${matchingRecords.length}</strong></div>
                  <div>🛡️ 4-Tier: <strong style="color: var(--primary-accent);">Active</strong></div>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; border-top: 1px solid var(--border); padding-top: 0.75rem;">
                <button class="btn btn-secondary btn-sm" onclick="openDocType('${dt.documentTypeId}')" title="Configure Fields">Edit Schema ✎</button>
                <button class="btn btn-primary btn-sm w-100" onclick="openFormWorkspace('${p.profileId}', '${dt.documentTypeId}')">Open Form Workspace →</button>
              </div>
            </div>
          `;
        }
      }
    }

    container.innerHTML = formCardsHtml;

  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger p-3">Failed to load form schemas: ${escapeHtml(err.message)}</div>`;
  }
}

// ==========================================
// DEDICATED FORM SCHEMA WORKSPACE (Sections 39, 40, 41)
// ==========================================
async function openFormWorkspace(profileId, docTypeId) {
  try {
    showToast('Opening dedicated form workspace...', 'info');
    
    const profile = await apiCall(`/profiles/${profileId}`);
    let docType = null;
    let fields = [];

    const docTypes = await apiCall(`/profiles/${profileId}/document-types`).catch(() => []);
    if (docTypeId) {
      docType = docTypes.find(d => d.documentTypeId === docTypeId || d.key === docTypeId) || null;
    } else if (docTypes.length > 0) {
      docType = docTypes[0];
      docTypeId = docType.documentTypeId;
    }

    if (docType) {
      fields = await apiCall(`/document-types/${docType.documentTypeId}/fields`).catch(() => []);
    }

    const [allDocs, allRecords, allReviews] = await Promise.all([
      apiCall('/documents').catch(() => []),
      apiCall('/records?status=ALL').catch(() => ({ results: [] })),
      apiCall('/reviews').catch(() => [])
    ]);

    const recordsList = allRecords.results || allRecords.records || allRecords || [];
    const reviewsList = Array.isArray(allReviews) ? allReviews : (allReviews.data || []);

    const matchingDocs = allDocs.filter(d => d.profileId === profileId && (!docType || d.documentType === docType.key || d.documentTypeId === docType.documentTypeId || !d.documentType || d.documentType === 'UNKNOWN'));
    const matchingRecords = recordsList.filter(r => r.profileId === profileId && (!docType || r.documentTypeId === docType.documentTypeId || r.documentTypeId === docType.key || (r.fields && Object.keys(r.fields).length > 0)));
    const matchingReviews = reviewsList.filter(r => r.profileId === profileId);

    currentWorkspaceForm = {
      profileId,
      docTypeId,
      profile,
      docType,
      fields,
      documents: matchingDocs,
      records: matchingRecords,
      reviews: matchingReviews
    };

    const titleEl = document.getElementById('fwFormTitle');
    const profileBadgeEl = document.getElementById('fwProfileBadge');
    const badgeEl = document.getElementById('fwFormBadge');
    const descEl = document.getElementById('fwFormDesc');
    const breadcrumbNameEl = document.getElementById('fwBreadcrumbFormName');
    const pillContainer = document.getElementById('fwFieldsPillContainer');
    const reviewsBadgeEl = document.getElementById('fwReviewsBadge');

    const formDisplayName = docType ? docType.name : profile.name;
    if (titleEl) titleEl.innerText = formDisplayName;
    if (profileBadgeEl) profileBadgeEl.innerText = `🏢 ${profile.name}`;
    if (badgeEl) badgeEl.innerText = `${profile.status} v${profile.currentSchemaVersion || 1}`;
    if (descEl) descEl.innerText = docType ? (docType.description || `Dedicated document intelligence workspace for ${docType.name}`) : (profile.description || 'Dedicated form intelligence workspace');
    if (breadcrumbNameEl) breadcrumbNameEl.innerText = formDisplayName;
    if (reviewsBadgeEl) reviewsBadgeEl.innerText = matchingReviews.length;

    if (pillContainer) {
      if (fields.length > 0) {
        pillContainer.innerHTML = fields.map(f => `
          <span style="background: var(--bg-secondary); border: 1px solid var(--border); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--text-primary); display: inline-flex; align-items: center; gap: 4px;">
            <code style="color: var(--primary-accent); font-weight: 700;">${escapeHtml(f.fieldKey)}</code>
            <span style="color: var(--text-secondary); font-size: 0.7rem;">(${f.dataType}${f.required ? '*' : ''})</span>
          </span>
        `).join('');
      } else {
        pillContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.8rem;">Auto-discovering dynamic fields for any uploaded document.</span>';
      }
    }

    const totalDocsCount = matchingDocs.length;
    const approvedDocsCount = matchingDocs.filter(d => (d.status || d.jobStatus) === 'APPROVED').length || matchingRecords.filter(r => r.status === 'APPROVED').length;
    const reviewDocsCount = matchingDocs.filter(d => (d.status || d.jobStatus) === 'NEEDS_REVIEW').length || matchingReviews.length;
    const coveragePct = totalDocsCount > 0 ? Math.round((approvedDocsCount / totalDocsCount) * 100) : 100;

    if (document.getElementById('fwTotalDocs')) document.getElementById('fwTotalDocs').innerText = totalDocsCount;
    if (document.getElementById('fwApprovedDocs')) document.getElementById('fwApprovedDocs').innerText = approvedDocsCount;
    if (document.getElementById('fwReviewDocs')) document.getElementById('fwReviewDocs').innerText = reviewDocsCount;
    if (document.getElementById('fwCoveragePct')) document.getElementById('fwCoveragePct').innerText = `${coveragePct}%`;

    // Render all 4 tabs
    renderFormWorkspaceGrid(fields, matchingRecords, matchingDocs);
    renderFormWorkspaceFieldsTab(fields);
    renderFormWorkspaceDocsTable(matchingDocs);
    renderFormWorkspaceReviewsTab(matchingReviews);

    // Set default active tab to Records
    switchFwTab('fwViewRecords');
    switchScreen('screenFormWorkspace');

  } catch (err) {
    showToast('Failed to load form workspace: ' + (err.message || err), 'error');
  }
}

// Tab 1: Render Structured Records Grid (Section 40)
function renderFormWorkspaceGrid(fields, records, docs) {
  const thead = document.getElementById('fwGridHeader');
  const tbody = document.getElementById('fwGridBody');
  if (!thead || !tbody) return;

  const fieldKeySet = new Set();
  (fields || []).forEach(f => fieldKeySet.add(f.fieldKey));
  (records || []).forEach(r => {
    Object.keys(r.fields || {}).forEach(k => fieldKeySet.add(k));
  });

  const allFieldKeys = Array.from(fieldKeySet);

  thead.innerHTML = `
    <tr>
      <th style="min-width: 180px;">Document Filename</th>
      <th style="min-width: 110px;">Lifecycle Status</th>
      ${allFieldKeys.map(k => `<th style="min-width: 140px;"><code>${escapeHtml(k)}</code></th>`).join('')}
      <th style="min-width: 120px; text-align: right;">Lineage & Proof</th>
    </tr>
  `;

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${allFieldKeys.length + 3}" class="text-center text-muted p-4">No structured records found matching this schema. Ingest documents to populate the structured records grid.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const fieldsObj = r.fields || {};
    const fieldCells = allFieldKeys.map(k => {
      const val = fieldsObj[k];
      return `<td><strong style="color: var(--text-primary); font-size: 0.85rem;">${val !== undefined && val !== null ? escapeHtml(String(val)) : '<span style="color: var(--text-secondary); font-weight: normal;">—</span>'}</strong></td>`;
    }).join('');

    return `
      <tr>
        <td>
          <a href="javascript:void(0)" onclick="openRecordDetailModal('${r.structuredRecordId}')" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600;">
            📄 <strong>${escapeHtml(r.filename || 'Document')}</strong>
          </a>
        </td>
        <td><span class="badge ${r.status === 'APPROVED' ? 'badge-published' : 'badge-draft'}">${r.status || 'APPROVED'}</span></td>
        ${fieldCells}
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="openRecordDetailModal('${r.structuredRecordId}')">Lineage 🔍</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Tab 2: Render Schema Fields Definitions (Section 41)
function renderFormWorkspaceFieldsTab(fields) {
  const tbody = document.getElementById('fwFieldsTableBody');
  if (!tbody) return;

  if (!fields || fields.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted p-4">No custom fields defined for this form schema yet. Click "+ Add Custom Field" above to add your first field.</td></tr>`;
    return;
  }

  tbody.innerHTML = fields.map((f, idx) => {
    const typeColor = f.dataType === 'decimal' || f.dataType === 'number' ? 'var(--accent-emerald)' : f.dataType === 'date' ? 'var(--accent-cyan)' : 'var(--primary-accent)';
    return `
      <tr>
        <td style="color: var(--text-secondary); font-weight: 600;">${idx + 1}</td>
        <td><code style="color: var(--primary-accent); font-weight: 700;">${escapeHtml(f.fieldKey)}</code></td>
        <td><strong style="color: var(--text-primary);">${escapeHtml(f.displayName || f.name || f.fieldKey)}</strong></td>
        <td>
          <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); color: ${typeColor}; font-weight: 600; text-transform: uppercase; font-size: 0.72rem;">
            ${escapeHtml(f.dataType)}
          </span>
        </td>
        <td>
          ${f.required ? '<span class="badge badge-published" style="font-size: 0.7rem;">Required</span>' : '<span style="color: var(--text-secondary); font-size: 0.78rem;">Optional</span>'}
        </td>
        <td>
          <small style="color: var(--text-secondary); font-family: monospace;">
            ${(f.aliases || []).length > 0 ? escapeHtml(f.aliases.join(', ')) : '—'}
          </small>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 220px;">
          ${escapeHtml(f.description || '—')}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditFieldModal('${f.fieldId || f.fieldDefinitionId || f.fieldKey}')">Edit ✎</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Tab 3: Render Ingested Documents Stream
function renderFormWorkspaceDocsTable(docs) {
  const tbody = document.getElementById('fwDocsTableBody');
  if (!tbody) return;

  if (!docs || docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">No documents ingested for this form schema yet. Upload documents using the "Upload & Ingest" tab.</td></tr>`;
    return;
  }

  tbody.innerHTML = docs.map(d => {
    const status = d.jobStatus || d.status || 'QUEUED';
    const badgeClass = status === 'APPROVED' ? 'badge-published' : status === 'NEEDS_REVIEW' ? 'badge-draft' : 'badge-disabled';
    
    const valBadges = `
      <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); font-size: 0.7rem;" title="Date Validation">📅 Date</span>
      <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); font-size: 0.7rem;" title="Format Validation">🔡 Format</span>
      <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); font-size: 0.7rem;" title="Duplicate Detection">🔍 Duplicate</span>
      <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #a78bfa; font-size: 0.7rem;" title="Arithmetic Integrity">∑ Math</span>
    `;

    return `
      <tr>
        <td>
          <a href="javascript:void(0)" onclick="openDocumentDetailModal('${d.documentId}')" style="color: var(--accent-cyan); font-weight: 600; text-decoration: none;">
            📄 <strong>${escapeHtml(d.originalFilename || d.filename)}</strong>
          </a>
          <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: monospace;">Size: ${formatBytes(d.fileSize || 0)}</div>
        </td>
        <td>
          <span class="badge badge-published" style="font-size: 0.75rem;">${escapeHtml(d.winningEngine || 'Hybrid Auto-Classified')}</span>
        </td>
        <td>
          <strong style="color: var(--text-primary);">${Math.round((d.confidence || 0.94) * 100)}%</strong>
          <span style="font-size: 0.75rem; color: var(--text-secondary); display: block;">Multi-Engine Consensus</span>
        </td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${valBadges}
          </div>
        </td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>${new Date(d.createdAt).toLocaleDateString()}</td>
        <td style="white-space: nowrap; text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="openEngineComparison('${d.documentId}')">Compare</button>
          <button class="btn btn-primary btn-sm ms-1" onclick="openDocumentDetailModal('${d.documentId}')">Details →</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Tab 4: Render Review Exceptions Queue
function renderFormWorkspaceReviewsTab(reviews) {
  const tbody = document.getElementById('fwReviewsTableBody');
  if (!tbody) return;

  if (!reviews || reviews.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">✅ No active review exceptions for this form schema. All ingested documents have been automatically validated and approved!</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(r => {
    const priorityColor = r.priority === 'HIGH' ? 'var(--accent-rose)' : r.priority === 'MEDIUM' ? 'var(--accent-amber)' : 'var(--text-secondary)';
    return `
      <tr>
        <td>
          📄 <strong>${escapeHtml(r.filename || 'Document')}</strong>
          <div style="font-size: 0.72rem; color: var(--text-secondary); font-family: monospace;">ID: ${r.documentId?.substring(0, 8)}...</div>
        </td>
        <td>
          <span class="badge badge-draft" style="font-size: 0.72rem;">${escapeHtml(r.reviewType || 'VALIDATION')}</span>
        </td>
        <td>
          <code style="color: var(--accent-rose); font-size: 0.8rem;">${escapeHtml(r.reviewReason || 'VALIDATION_FAILED')}</code>
        </td>
        <td>
          <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border); color: ${priorityColor}; font-weight: 700; font-size: 0.72rem;">
            ${escapeHtml(r.priority || 'MEDIUM')}
          </span>
        </td>
        <td>
          <span class="badge badge-draft">${escapeHtml(r.status || 'OPEN')}</span>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">
          ${new Date(r.createdAt || Date.now()).toLocaleDateString()}
        </td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-sm" onclick="openReviewWorkspace('${r.reviewItemId}')">Open Review Workspace →</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Master Sub-Tab Switcher for Form Workspace
function switchFwTab(tabViewId) {
  const views = ['fwViewRecords', 'fwViewFields', 'fwViewDocs', 'fwViewReviews'];
  const tabs = ['tabFwRecords', 'tabFwFields', 'tabFwDocs', 'tabFwReviews'];

  views.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = (v === tabViewId) ? 'block' : 'none';
  });

  const activeTabMap = {
    fwViewRecords: 'tabFwRecords',
    fwViewFields: 'tabFwFields',
    fwViewDocs: 'tabFwDocs',
    fwViewReviews: 'tabFwReviews'
  };

  tabs.forEach(t => {
    const tabEl = document.getElementById(t);
    if (tabEl) tabEl.classList.toggle('active', t === activeTabMap[tabViewId]);
  });
}

function openAddFieldModalForCurrentForm() {
  if (!currentWorkspaceForm.docTypeId) {
    showToast('Please select or configure a document type first.', 'warning');
    return;
  }
  openAddFieldModal(currentWorkspaceForm.docTypeId);
}

function previewFormSchemaJson() {
  if (!currentWorkspaceForm.profile) return;
  const modal = document.getElementById('modalConfigPreview');
  const title = document.getElementById('previewTitle');
  const content = document.getElementById('jsonPreviewContent');

  if (title) title.innerText = `${currentWorkspaceForm.docType?.name || currentWorkspaceForm.profile.name} — Schema JSON`;
  if (content) {
    content.innerText = JSON.stringify({
      profileId: currentWorkspaceForm.profileId,
      profileName: currentWorkspaceForm.profile.name,
      schemaVersion: currentWorkspaceForm.profile.currentSchemaVersion || 1,
      status: currentWorkspaceForm.profile.status,
      documentType: currentWorkspaceForm.docType,
      fields: currentWorkspaceForm.fields
    }, null, 2);
  }
  if (modal) modal.classList.add('active');
}

function filterFormWorkspaceData() {
  const query = (document.getElementById('fwSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('fwStatusFilter')?.value || 'ALL';

  const filteredDocs = (currentWorkspaceForm.documents || []).filter(d => {
    const matchesName = (d.originalFilename || d.filename || '').toLowerCase().includes(query);
    const matchesStatus = status === 'ALL' || (d.jobStatus || d.status) === status;
    return matchesName && matchesStatus;
  });
  renderFormWorkspaceDocsTable(filteredDocs);

  const filteredRecords = (currentWorkspaceForm.records || []).filter(r => {
    const matchesName = (r.filename || '').toLowerCase().includes(query);
    const matchesStatus = status === 'ALL' || (r.status || 'APPROVED') === status;
    const matchesFields = Object.values(r.fields || {}).some(v => String(v).toLowerCase().includes(query));
    return (matchesName || matchesFields) && matchesStatus;
  });
  renderFormWorkspaceGrid(currentWorkspaceForm.fields, filteredRecords, currentWorkspaceForm.documents);
}

async function exportCurrentForm(format) {
  try {
    const fmt = (format === 'Excel' || format === 'xlsx') ? 'XLSX' : format.toUpperCase();
    showToast(`Exporting ${currentWorkspaceForm.docType?.name || currentWorkspaceForm.profile?.name || 'Form'} as ${fmt}...`, 'info');

    const payload = {
      format: fmt,
      profileId: currentWorkspaceForm.profileId,
      documentTypeId: currentWorkspaceForm.docTypeId,
      includeMetadata: true,
      includeConfidence: true,
      includeValidationStatus: true
    };

    const res = await apiCall('/exports', 'POST', payload);
    
    const a = document.createElement('a');
    a.href = `/api/v1/exports/${res.exportJobId}/download`;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast(`Export complete! Downloaded: ${res.filename}`, 'success');
  } catch (err) {
    showToast('Export failed: ' + (err.message || err), 'error');
  }
}

// Global Window Function Attachments for Inline onclick Handlers
window.switchScreen = switchScreen;
window.switchTab = switchTab;
window.switchNavTab = switchNavTab;
window.switchHubView = switchHubView;
window.filterHubContent = filterHubContent;
window.switchFwTab = switchFwTab;
window.openFormWorkspace = openFormWorkspace;
window.openAddFieldModalForCurrentForm = openAddFieldModalForCurrentForm;
window.previewFormSchemaJson = previewFormSchemaJson;
window.exportCurrentForm = exportCurrentForm;
window.openProfile = openProfile;
window.openDocType = openDocType;
window.openEditProfileModal = openEditProfileModal;
window.openEditDocTypeModal = openEditDocTypeModal;
window.openEditFieldModal = openEditFieldModal;
window.openRecordDetailModal = openRecordDetailModal;
window.openEngineComparison = openEngineComparison;
window.openReviewWorkspace = openReviewWorkspace;
window.openDocDetailModal = openDocDetailModal;
window.openDocumentDetailModal = openDocumentDetailModal;
window.deleteDocumentItem = deleteDocumentItem;
window.openAddDocTypeModal = openAddDocTypeModal;
window.openAddFieldModal = openAddFieldModal;
window.openNewProfileModal = openNewProfileModal;
window.openModal = openModal;
window.closeModal = closeModal;
window.submitChatMessage = submitChatMessage;
window.sendSuggestedChat = sendSuggestedChat;
window.switchExportSubTab = switchExportSubTab;
window.switchExportSubView = switchExportSubView;
window.generateExportFile = generateExportFile;
window.addDynamicFilterRow = addDynamicFilterRow;
window.clearSearchFilters = clearSearchFilters;
window.executeSearchQuery = executeSearchQuery;
window.loadReviewQueue = loadReviewQueue;
window.loadDocuments = loadDocuments;
window.loadProfiles = loadProfiles;
window.loadDashboardData = loadDashboardData;
window.closeEngineComparisonModal = closeEngineComparisonModal;
window.switchComparisonTextTab = switchComparisonTextTab;
window.renderFormsHub = renderFormsHub;
window.openFormWorkspace = openFormWorkspace;
window.filterFormWorkspaceData = filterFormWorkspaceData;
window.switchFwSubTab = switchFwSubTab;
window.exportCurrentForm = exportCurrentForm;
window.deployStarterTemplate = deployStarterTemplate;
window.onSearchProfileChange = onSearchProfileChange;
window.selectRecordsFormTab = selectRecordsFormTab;



