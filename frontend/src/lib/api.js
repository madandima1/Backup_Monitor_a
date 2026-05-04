import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const opts = { withCredentials: true };

// Companies
export const getCompanies = () => axios.get(`${API}/companies`, opts).then(r => r.data);
export const createCompany = (data) => axios.post(`${API}/companies`, data, opts).then(r => r.data);
export const updateCompany = (id, data) => axios.put(`${API}/companies/${id}`, data, opts).then(r => r.data);
export const deleteCompany = (id) => axios.delete(`${API}/companies/${id}`, opts).then(r => r.data);

// Backups
export const getBackups = (params) => axios.get(`${API}/backups`, { ...opts, params }).then(r => r.data);
export const createBackup = (data) => axios.post(`${API}/backups`, data, opts).then(r => r.data);
export const deleteBackup = (id) => axios.delete(`${API}/backups/${id}`, opts).then(r => r.data);
export const getBackupStats = () => axios.get(`${API}/backups/stats`, opts).then(r => r.data);

// Platforms
export const getPlatforms = () => axios.get(`${API}/platforms`, opts).then(r => r.data);
export const createPlatform = (data) => axios.post(`${API}/platforms`, data, opts).then(r => r.data);

// Alerts
export const getAlerts = () => axios.get(`${API}/alerts`, opts).then(r => r.data);
export const dismissAlert = (id) => axios.post(`${API}/alerts/dismiss`, { alert_id: id }, opts).then(r => r.data);
export const generateAlerts = () => axios.post(`${API}/alerts/generate`, {}, opts).then(r => r.data);

// Users
export const getUsers = () => axios.get(`${API}/users`, opts).then(r => r.data);
export const createUser = (data) => axios.post(`${API}/users`, data, opts).then(r => r.data);
export const updateUser = (id, data) => axios.put(`${API}/users/${id}`, data, opts).then(r => r.data);
export const deleteUser = (id) => axios.delete(`${API}/users/${id}`, opts).then(r => r.data);
export const adminResetUserPassword = (id, new_password) => axios.post(`${API}/users/${id}/reset-password`, { new_password }, opts).then(r => r.data);
export const changeOwnPassword = (current_password, new_password) => axios.post(`${API}/auth/change-password`, { current_password, new_password }, opts).then(r => r.data);

// Config
export const exportConfig = () => axios.get(`${API}/config/export`, { ...opts, responseType: 'blob' }).then(r => r.data);
export const importConfig = (data) => axios.post(`${API}/config/import`, data, opts).then(r => r.data);

// Backups Export
export const exportBackups = (params) => axios.get(`${API}/backups/export`, { ...opts, params, responseType: 'blob' }).then(r => r.data);

// Email Settings
export const getEmailSettings = () => axios.get(`${API}/settings/email`, opts).then(r => r.data);
export const saveEmailSettings = (data) => axios.post(`${API}/settings/email`, data, opts).then(r => r.data);
export const testEmailConnection = () => axios.post(`${API}/settings/email/test`, {}, opts).then(r => r.data);

// Webhook Settings
export const getWebhookSettings = () => axios.get(`${API}/webhook/settings`, opts).then(r => r.data);
export const saveWebhookSettings = (data) => axios.post(`${API}/webhook/settings`, data, opts).then(r => r.data);
export const regenerateWebhookToken = () => axios.post(`${API}/webhook/regenerate-token`, {}, opts).then(r => r.data);
export const getWebhookLog = (limit = 50) => axios.get(`${API}/webhook/log`, { ...opts, params: { limit } }).then(r => r.data);

// Manual Email Import
export const createBackupFromEmail = (data) => axios.post(`${API}/backups/from-email`, data, opts).then(r => r.data);

// Parse Email Test
export const parseEmailTest = (data) => axios.post(`${API}/parse-email-test`, data, opts).then(r => r.data);

// SMTP Settings
export const getSmtpSettings = () => axios.get(`${API}/settings/smtp`, opts).then(r => r.data);
export const saveSmtpSettings = (data) => axios.post(`${API}/settings/smtp`, data, opts).then(r => r.data);
export const testSmtpConnection = () => axios.post(`${API}/settings/smtp/test`, {}, opts).then(r => r.data);

// Alert Recipients
export const getAlertRecipients = () => axios.get(`${API}/settings/alert-recipients`, opts).then(r => r.data);
export const addAlertRecipient = (data) => axios.post(`${API}/settings/alert-recipients`, data, opts).then(r => r.data);
export const deleteAlertRecipient = (id) => axios.delete(`${API}/settings/alert-recipients/${id}`, opts).then(r => r.data);

// Alert Check Settings
export const getAlertCheckSettings = () => axios.get(`${API}/settings/alert-check`, opts).then(r => r.data);
export const saveAlertCheckSettings = (data) => axios.post(`${API}/settings/alert-check`, data, opts).then(r => r.data);

// Alert Email History
export const getAlertEmailHistory = () => axios.get(`${API}/alerts/email-history`, opts).then(r => r.data);

// Check and Notify
export const checkAndNotify = () => axios.post(`${API}/alerts/check-and-notify`, {}, opts).then(r => r.data);

// IMAP Settings
export const getImapSettings = () => axios.get(`${API}/settings/imap`, opts).then(r => r.data);
export const saveImapSettings = (data) => axios.post(`${API}/settings/imap`, data, opts).then(r => r.data);
export const testImapConnection = () => axios.post(`${API}/settings/imap/test`, {}, opts).then(r => r.data);
export const syncImapEmails = () => axios.post(`${API}/settings/imap/sync`, {}, opts).then(r => r.data);
export const getImapSyncLog = (limit = 20) => axios.get(`${API}/settings/imap/log`, { ...opts, params: { limit } }).then(r => r.data);

// Backup Detail
export const getBackupDetail = (id) => axios.get(`${API}/backups/detail/${id}`, opts).then(r => r.data);

// System Alerts (UPS, security, hardware)
export const getSystemAlerts = (params) => axios.get(`${API}/system-alerts`, { ...opts, params }).then(r => r.data);
export const acknowledgeSystemAlert = (id) => axios.post(`${API}/system-alerts/${id}/acknowledge`, {}, opts).then(r => r.data);

// Reports Export (PDF/XLSX/DOCX)
export const exportReport = (data) =>
  axios.post(`${API}/reports/export`, data, { ...opts, responseType: 'blob' }).then(r => r.data);

export const getReportHeaderStatus = () =>
  axios.get(`${API}/settings/report-header`, opts).then(r => r.data);

export const uploadReportHeader = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return axios.post(`${API}/settings/report-header`, fd, { ...opts, headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

export const deleteReportHeader = () =>
  axios.delete(`${API}/settings/report-header`, opts).then(r => r.data);
