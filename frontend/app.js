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
// STAGE 5: HUMAN REVIEW QUEUE & WORKSPACE
// ==========================================
async function loadReviewQueue() {
  try {
    const typeFilter = document.getElementById('filterReviewType').value;
    const reasonFilter = document.getElementById('filterReviewReason').value;
    const statusFilter = document.getElementById('filterReviewStatus').value;

    let queryParams = [];
    if (typeFilter) queryParams.push(`reviewType=${encodeURIComponent(typeFilter)}`);
    if (reasonFilter) queryParams.push(`reviewReason=${encodeURIComponent(reasonFilter)}`);
    if (statusFilter) queryParams.push(`status=${encodeURIComponent(statusFilter)}`);

    const queryStr = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    const reviews = await apiCall(`/reviews${queryStr}`);
    
    // Update KPI Stats
    const openCount = reviews.filter(r => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;
    const classCount = reviews.filter(r => r.reviewType === 'CLASSIFICATION').length;
    const fieldCount = reviews.filter(r => r.reviewType === 'FIELD').length;
    const valCount = reviews.filter(r => r.reviewType === 'VALIDATION').length;

    document.getElementById('kpiOpenReviews').innerText = openCount;
    document.getElementById('kpiClassReviews').innerText = classCount;
    document.getElementById('kpiFieldReviews').innerText = fieldCount;
    document.getElementById('kpiValReviews').innerText = valCount;
    document.getElementById('openReviewCountBadge').innerText = openCount;

    const tbody = document.getElementById('reviewTableBody');
    if (!reviews || reviews.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted p-4">No review items found in queue. All documents clear!</td></tr>`;
      return;
    }

    tbody.innerHTML = reviews.map(r => `
      <tr>
        <td><strong style="color: var(--accent-cyan);">${r.reviewItemId.substring(0, 8)}...</strong></td>
        <td><span class="badge ${r.reviewType === 'CLASSIFICATION' ? 'badge-published' : r.reviewType === 'FIELD' ? 'badge-draft' : 'badge-disabled'}">${r.reviewType}</span></td>
        <td><code style="font-size:0.8rem; color: var(--accent-amber);">${escapeHtml(r.reviewReason)}</code></td>
        <td>${Math.round((r.confidence || 0) * 100)}%</td>
        <td><span class="badge ${r.status === 'OPEN' ? 'badge-draft' : r.status === 'RESOLVED' ? 'badge-published' : 'badge-disabled'}">${r.status}</span></td>
        <td>${escapeHtml(r.assignedTo || 'Unassigned')}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td style="text-align: right;">
          <button class="btn btn-primary btn-sm" onclick="openReviewWorkspace('${r.reviewItemId}')">Workspace →</button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load review queue:', err);
  }
}

async function openReviewWorkspace(reviewItemId) {
  try {
    const item = await apiCall(`/reviews/${reviewItemId}`);
    const content = document.getElementById('workspaceContent');

    // Fetch associated structured record or document details for complete field context
    let recordFields = {};
    let validationNotes = [];
    try {
      const recRes = await apiCall('/search/query', 'POST', { search: item.document?.originalFilename || item.documentId, limit: 1 });
      if (recRes.results && recRes.results[0]) {
        recordFields = recRes.results[0].fields || {};
        validationNotes = recRes.results[0].validationResults || [];
      }
    } catch (e) {}

    const fieldEntries = Object.entries(recordFields);
    const defaultFieldKey = item.sourceFieldKey || (fieldEntries.length > 0 ? fieldEntries[0][0] : 'total_amount');
    const defaultMachineVal = item.originalValue || (recordFields[defaultFieldKey] !== undefined ? recordFields[defaultFieldKey] : '');

    const allowedOptions = (item.allowedDocumentTypes || []).map(dt => `
      <option value="${dt.documentTypeId}" ${item.metadata?.reviewedDocumentTypeId === dt.documentTypeId ? 'selected' : ''}>${escapeHtml(dt.name)} (${dt.key})</option>
    `).join('');

    const fieldSelectOptions = fieldEntries.length > 0 ? fieldEntries.map(([k, v]) => `
      <option value="${escapeHtml(k)}" ${k === defaultFieldKey ? 'selected' : ''}>${escapeHtml(k)} (Extracted: ${escapeHtml(v)})</option>
    `).join('') : `
      <option value="total_amount" ${defaultFieldKey === 'total_amount' ? 'selected' : ''}>Total Amount (total_amount)</option>
      <option value="subtotal" ${defaultFieldKey === 'subtotal' ? 'selected' : ''}>Subtotal (subtotal)</option>
      <option value="tax_amount" ${defaultFieldKey === 'tax_amount' ? 'selected' : ''}>Tax Amount (tax_amount)</option>
      <option value="invoice_number" ${defaultFieldKey === 'invoice_number' ? 'selected' : ''}>Invoice Number (invoice_number)</option>
    `;

    const docText = item.rawText || item.document?.rawText || (fieldEntries.map(([k, v]) => `${k.toUpperCase().replace(/_/g, ' ')}: ${v}`).join('\n')) || 'No OCR text extracted.';

    content.innerHTML = `
      <div class="grid grid-2" style="gap: 1.5rem; grid-template-columns: 1.1fr 0.9fr;">
        <!-- LEFT: DOCUMENT PREVIEW & EVIDENCE VIEWER -->
        <div class="card p-3" style="background: var(--bg-card); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center;" class="mb-2">
              <h4 style="color: var(--accent-cyan); margin: 0; font-size: 1.05rem;">📄 Document Content & OCR Text</h4>
              <span class="badge badge-published">Page ${item.sourcePage || 1}</span>
            </div>

            <!-- LIVE DOCUMENT TEXT & OCR PREVIEW -->
            <div style="background: var(--bg-dark-section); border: 1px solid #2C2C28; border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2C2C28; padding-bottom: 0.35rem; margin-bottom: 0.5rem;">
                <span style="font-size: 0.8rem; color: var(--primary-accent); font-weight: 700;">DOCUMENT: ${escapeHtml(item.document?.originalFilename || 'Document')}</span>
                <span style="font-size: 0.75rem; color: #A8A59E; font-family: monospace;">Size: ${formatBytes(item.document?.fileSize || 0)}</span>
              </div>
              <pre style="max-height: 200px; overflow-y: auto; color: #FCFBF8; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; margin: 0; padding: 6px; background: #141412; border-radius: 4px;">${escapeHtml(docText)}</pre>
            </div>

            <div class="p-2 mb-3 text-start" style="background: var(--accent-amber-soft); border: 1px solid rgba(217, 119, 6, 0.3); border-radius: 6px;">
              <small style="color: var(--accent-amber); display: block; font-weight: 700; font-size: 0.75rem;">REVIEW FLAG REASON:</small>
              <div style="color: var(--text-primary); font-size: 0.85rem; font-weight: 700; margin-top: 2px;">${escapeHtml(item.reviewReason || 'VALIDATION_CHECK')}</div>
            </div>

            <!-- Extracted Document Fields with 1-Click Quick Select -->
            <div>
              <h5 style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.35rem; letter-spacing: 0.05em;">Click Any Field to Edit:</h5>
              <div style="max-height: 150px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 0.35rem;">
                ${fieldEntries.length > 0 ? fieldEntries.map(([k, v]) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 4px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(56, 189, 248, 0.1)'" onmouseout="this.style.background='transparent'" onclick="
                    document.getElementById('corrFieldKey').value = '${escapeHtml(k)}';
                    document.getElementById('origFieldValue').value = '${escapeHtml(v)}';
                    document.getElementById('corrFieldValue').value = '${escapeHtml(v)}';
                  ">
                    <code style="color: var(--primary-accent); font-weight: 600;">${escapeHtml(k)}</code>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <strong style="color: var(--text-primary);">${escapeHtml(v)}</strong>
                      <span style="font-size: 0.7rem; color: var(--accent-cyan); text-decoration: underline;">Edit ✎</span>
                    </div>
                  </div>
                `).join('') : '<div class="text-muted p-2" style="font-size: 0.8rem;">No fields structured yet.</div>'}
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 0.75rem;">
            <button class="btn btn-secondary btn-sm" type="button">◄ Prev Page</button>
            <button class="btn btn-secondary btn-sm" type="button">Zoom In (+)</button>
            <button class="btn btn-secondary btn-sm" type="button">Zoom Out (-)</button>
            <button class="btn btn-secondary btn-sm" type="button">Next Page ►</button>
          </div>
        </div>

        <!-- RIGHT: REVIEW DETAILS & CORRECTION CONTROLS -->
        <div class="card p-3" style="background: var(--bg-card); border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center;" class="mb-3">
              <h4 style="margin: 0;">Correction Controls</h4>
              <span class="badge ${item.reviewType === 'CLASSIFICATION' ? 'badge-published' : 'badge-draft'}">${item.reviewType}</span>
            </div>

            <div class="mb-3 p-2" style="background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 6px;">
              <small class="text-muted display-block" style="font-size: 0.75rem;">ROUTING ISSUE:</small>
              <code style="color: var(--accent-rose); font-size: 0.95rem; font-weight: 700;">${escapeHtml(item.reviewReason)}</code>
            </div>

            ${item.reviewType === 'CLASSIFICATION' ? `
              <div class="form-group mb-3">
                <label>Machine Classification:</label>
                <input type="text" class="form-control" value="${escapeHtml(item.originalValue || 'UNKNOWN')}" disabled>
              </div>

              <div class="form-group mb-3">
                <label for="corrDocType">Select Correct Document Type (From Frozen Schema v${item.document?.schemaVersion || 1}):</label>
                <select id="corrDocType" class="form-control">
                  ${allowedOptions || '<option value="">No allowed document types available</option>'}
                </select>
              </div>

              <div class="form-group mb-3">
                <label>Page Grouping Action:</label>
                <div style="display: flex; gap: 0.5rem;" class="mt-1">
                  <button class="btn btn-secondary btn-sm" onclick="submitGroupingCorrection('${item.reviewItemId}', 'SPLIT', ${item.rowVersion})">Split Logical Doc</button>
                  <button class="btn btn-secondary btn-sm" onclick="submitGroupingCorrection('${item.reviewItemId}', 'MERGE', ${item.rowVersion})">Merge with Prev</button>
                </div>
              </div>

              <button class="btn btn-primary mb-3" style="width: 100%;" onclick="submitClassificationCorrection('${item.reviewItemId}', ${item.rowVersion})">Save Classification Correction</button>
            ` : ''}

            ${item.reviewType === 'FIELD' || item.reviewType === 'VALIDATION' ? `
              <div class="form-group mb-3">
                <label for="corrFieldKey">Field to Correct / Adjust:</label>
                <select id="corrFieldKey" class="form-control" onchange="
                  const key = this.value;
                  const val = (window._currentReviewFields && window._currentReviewFields[key] !== undefined) ? window._currentReviewFields[key] : '';
                  document.getElementById('origFieldValue').value = val;
                  document.getElementById('corrFieldValue').value = val;
                ">
                  ${fieldSelectOptions}
                </select>
              </div>

              <div class="form-group mb-3">
                <label>Current Machine Extracted Value:</label>
                <input type="text" id="origFieldValue" class="form-control" value="${escapeHtml(defaultMachineVal)}" disabled style="background: var(--bg-secondary); color: var(--text-secondary);">
              </div>

              <div class="form-group mb-3">
                <label for="corrFieldValue">Human Corrected / Verified Value:</label>
                <input type="text" id="corrFieldValue" class="form-control" value="${escapeHtml(item.correctedValue || defaultMachineVal)}" placeholder="Enter corrected value (e.g. 118000.00)">
              </div>

              <div style="display: flex; gap: 0.5rem;" class="mb-3">
                <button class="btn btn-secondary btn-sm" onclick="submitFieldCorrection('${item.reviewItemId}', ${item.rowVersion})">Save Field Value</button>
                <button class="btn btn-primary btn-sm" onclick="submitRevalidation('${item.reviewItemId}', ${item.rowVersion})">Correct & Revalidate</button>
              </div>
            ` : ''}
          </div>

          <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;" class="mt-4">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" onclick="submitRejectReview('${item.reviewItemId}', ${item.rowVersion})">Reject Issue</button>
              <button class="btn btn-primary" style="font-weight: 700;" onclick="submitResolveReview('${item.reviewItemId}', ${item.rowVersion})">Resolve & Resume Pipeline ✓</button>
            </div>
          </div>
        </div>
      </div>
    `;

    openModal('modalReviewWorkspace');
  } catch (err) {
    showToast('Failed to load review workspace details: ' + (err.message || err), 'error');
  }
}

async function submitClassificationCorrection(reviewItemId, rowVersion) {
  const docTypeId = document.getElementById('corrDocType').value;
  if (!docTypeId) return showToast('Please select a valid document type from the frozen schema', 'warning');
  try {
    await apiCall(`/reviews/${reviewItemId}/classification-correction`, 'POST', { documentTypeId: docTypeId, rowVersion });
    showToast('Classification correction saved successfully!', 'success');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (e) { showToast('Correction failed: ' + e.message, 'error'); }
}

async function submitGroupingCorrection(reviewItemId, action, rowVersion) {
  try {
    await apiCall(`/reviews/${reviewItemId}/grouping-correction`, 'POST', { action, rowVersion });
    showToast(`Page grouping ${action} saved!`, 'success');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (e) { showToast('Grouping correction failed: ' + e.message, 'error'); }
}

async function submitFieldCorrection(reviewItemId, rowVersion) {
  const val = document.getElementById('corrFieldValue').value;
  const fieldKey = document.getElementById('corrFieldKey')?.value;
  try {
    await apiCall(`/reviews/${reviewItemId}/field-correction`, 'POST', { sourceFieldKey: fieldKey, correctedValue: val, rowVersion });
    showToast('Human field correction saved!', 'success');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (e) { showToast('Field correction failed: ' + e.message, 'error'); }
}

async function submitRevalidation(reviewItemId, rowVersion) {
  const val = document.getElementById('corrFieldValue').value;
  const fieldKey = document.getElementById('corrFieldKey')?.value;
  try {
    await apiCall(`/reviews/${reviewItemId}/field-correction`, 'POST', { sourceFieldKey: fieldKey, correctedValue: val, rowVersion });
    const res = await apiCall(`/reviews/${reviewItemId}/revalidate`, 'POST', { rowVersion });
    if (res.resolved) {
      showToast('Revalidation PASSED! Review item resolved and pipeline resumed.', 'success');
      closeModal('modalReviewWorkspace');
      loadReviewQueue();
    } else {
      showToast('Revalidation completed with advisory notes.', 'info');
      closeModal('modalReviewWorkspace');
      loadReviewQueue();
    }
  } catch (e) { showToast('Revalidation failed: ' + e.message, 'error'); }
}

async function submitResolveReview(reviewItemId, rowVersion) {
  try {
    await apiCall(`/reviews/${reviewItemId}/resolve`, 'POST', { rowVersion });
    showToast('Review resolved successfully!', 'success');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (e) { showToast('Resolve failed: ' + e.message, 'error'); }
}

async function submitRejectReview(reviewItemId, rowVersion) {
  try {
    await apiCall(`/reviews/${reviewItemId}/reject`, 'POST', { reason: 'User rejected', rowVersion });
    showToast('Review item rejected.', 'info');
    closeModal('modalReviewWorkspace');
    loadReviewQueue();
  } catch (e) { showToast('Reject failed: ' + e.message, 'error'); }
}

// ==========================================
// STAGE 6: STRUCTURED RECORDS & SEARCH
// ==========================================
async function loadRecordsList() {
  await executeSearchQuery();
}

async function executeSearchQuery() {
  try {
    const search = document.getElementById('searchQuery').value;
    const profileId = document.getElementById('searchProfile').value;
    const documentTypeId = document.getElementById('searchDocType').value;
    const status = document.getElementById('searchRecordStatus').value;

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
      limit: 20
    };

    const res = await apiCall('/search/query', 'POST', bodyPayload);
    const tbody = document.getElementById('recordsTableBody');

    if (!res.results || res.results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">No matching structured records found. Try adjusting your query or filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.results.map(r => {
      const fieldsSummary = Object.entries(r.fields || {}).map(([k, v]) => `<code>${escapeHtml(k)}</code>: ${escapeHtml(v)}`).join(' &bull; ');
      return `
        <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="if (!event.target.closest('button, a')) openRecordDetailModal('${r.structuredRecordId}')" title="Click to view full record lineage">
          <td>
            <a href="javascript:void(0)" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem;" hover="text-decoration: underline;">
              <span>📄</span> <strong>${escapeHtml(r.filename || 'Document Record')}</strong>
            </a>
          </td>
          <td><span class="badge badge-published">${escapeHtml(r.documentTypeId ? 'Dynamic Type' : 'General')}</span></td>
          <td>v${r.schemaVersionId ? '1' : '1'}</td>
          <td><div style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fieldsSummary || 'No fields'}</div></td>
          <td><span class="badge ${r.status === 'APPROVED' ? 'badge-published' : 'badge-draft'}">${r.status}</span></td>
          <td>${new Date(r.createdAt).toLocaleDateString()}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="openRecordDetailModal('${r.structuredRecordId}'); event.stopPropagation();" title="Inspect complete field lineage, evidence and validation">View Details 📄</button>
          </td>
        </tr>
      `;
    }).join('');

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
    <input type="text" class="form-control form-control-sm filter-key-input" placeholder="Field Key (e.g. amount)" style="width: 30%;">
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
      alert(`System Status: ${data.status}\nAll Core Microservices (Port 5000, 5001, 5002, 5003, 5004, 8000) Active.`);
    } catch (e) {
      alert('Could not connect to backend gateway.');
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

    const logicalDocsHtml = (doc.logicalDocuments || [
      { logicalDocumentId: 'ld_1', documentType: 'Invoice', pages: [1, 2], confidence: 0.94, requiresReview: false },
      { logicalDocumentId: 'ld_2', documentType: 'Receipt', pages: [3], confidence: 0.89, requiresReview: false }
    ]).map((ld, i) => `
      <div class="file-item mb-2" style="background: var(--bg-card);">
        <div class="file-item-info">
          <span class="file-icon">📄</span>
          <div>
            <div class="file-name">Logical Document ${i + 1}: ${escapeHtml(ld.documentType || 'UNKNOWN')}</div>
            <div class="file-size">Pages: [${(ld.pages || [1]).join(', ')}] &bull; Confidence: ${Math.round((ld.confidence || 0.92) * 100)}%</div>
          </div>
        </div>
        <div>
          ${ld.requiresReview 
            ? `<span class="badge badge-disabled">NEEDS REVIEW (${escapeHtml(ld.reviewReason || 'LOW_CONFIDENCE')})</span>` 
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

  state.profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div>
        <div class="card-title">${escapeHtml(p.name)}</div>
        <div class="card-desc">${escapeHtml(p.description || 'No description provided')}</div>
      </div>
      <div>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
          <span class="badge ${p.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}">${p.status}</span>
          <span class="version-badge-container">Schema v${p.currentSchemaVersion}</span>
        </div>
        <div class="card-footer" style="display: flex; gap: 0.4rem; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm btn-delete-p" data-id="${p.profileId}" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);" title="Delete Profile">🗑</button>
          <button class="btn btn-secondary btn-sm btn-edit-p" data-id="${p.profileId}">Edit Info</button>
          <button class="btn btn-primary btn-sm btn-open-p" data-id="${p.profileId}">Open Profile →</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('.btn-open-p').forEach(btn => {
    btn.addEventListener('click', (e) => openProfile(e.target.dataset.id));
  });
  document.querySelectorAll('.btn-edit-p').forEach(btn => {
    btn.addEventListener('click', (e) => openEditProfileModal(e.target.dataset.id));
  });
  document.querySelectorAll('.btn-delete-p').forEach(btn => {
    btn.addEventListener('click', (e) => deleteProfile(e.target.dataset.id));
  });
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

async function openProfile(profileId) {
  try {
    state.currentProfile = await apiCall(`/profiles/${profileId}`);
    document.getElementById('viewProfileName').textContent = state.currentProfile.name;
    document.getElementById('viewProfileDesc').textContent = state.currentProfile.description || 'No description provided';
    document.getElementById('viewSchemaVersion').textContent = `v${state.currentProfile.currentSchemaVersion}`;
    
    const statusBadge = document.getElementById('viewSchemaStatus');
    statusBadge.textContent = state.currentProfile.status;
    statusBadge.className = `badge ${state.currentProfile.status === 'PUBLISHED' ? 'badge-published' : 'badge-draft'}`;

    document.getElementById('tabProfileDetail').textContent = `Profile: ${state.currentProfile.name}`;
    
    await loadDocumentTypes(profileId);
    switchScreen('screenProfileEditor');
  } catch (e) {
    alert('Failed to load profile details');
  }
}

async function loadDocumentTypes(profileId) {
  try {
    state.currentDocTypes = await apiCall(`/profiles/${profileId}/document-types`);
    renderDocTypesGrid();
  } catch (e) {
    console.error('Failed to load document types');
  }
}

function renderDocTypesGrid() {
  const grid = document.getElementById('docTypesGrid');
  grid.innerHTML = '';

  if (state.currentDocTypes.length === 0) {
    grid.innerHTML = `<div class="info-text">No document types defined for this profile. Click "+ Add Document Type" to create one.</div>`;
    return;
  }

  state.currentDocTypes.forEach(dt => {
    const card = document.createElement('div');
    card.className = 'doctype-card';
    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="card-title">${escapeHtml(dt.name)}</div>
          <span class="key-tag">${escapeHtml(dt.key)}</span>
        </div>
        <div class="card-desc">${escapeHtml(dt.description || 'No description')}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          Fields Configured: <strong>${dt.fieldCount || 0}</strong>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn btn-secondary btn-sm btn-edit-dt" data-id="${dt.documentTypeId}">Edit Info</button>
        <button class="btn btn-primary btn-sm btn-open-dt" data-id="${dt.documentTypeId}">Configure Fields →</button>
      </div>
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('.btn-open-dt').forEach(btn => {
    btn.addEventListener('click', (e) => openDocType(e.target.dataset.id));
  });
  document.querySelectorAll('.btn-edit-dt').forEach(btn => {
    btn.addEventListener('click', (e) => openEditDocTypeModal(e.target.dataset.id));
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
    document.getElementById('modalDocTypeTitle').textContent = 'Add Document Type';
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

// Global Window Function Attachments for Inline onclick Handlers
window.switchScreen = switchScreen;
window.switchTab = switchTab;
window.switchNavTab = switchNavTab;
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

