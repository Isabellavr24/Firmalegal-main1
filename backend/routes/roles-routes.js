/**
 * =============================================
 * RUTAS DE ROLES DE FIRMANTES
 * =============================================
 */

const express = require('express');
const router = express.Router();
const rolesController = require('../controllers/roles-controller');

// Middleware de autenticación
const { requireAuth } = require('../middleware/auth');

// =============================================
// GESTIÓN DE ROLES
// =============================================

/**
 * Crear roles para un documento
 * POST /api/documents/:documentId/roles
 */
router.post(
    '/documents/:documentId/roles',
    requireAuth,
    rolesController.createRoles
);

/**
 * Obtener roles de un documento
 * GET /api/documents/:documentId/roles
 */
router.get(
    '/documents/:documentId/roles',
    requireAuth,
    rolesController.getRoles
);

/**
 * Auto-crear roles basándose en número de destinatarios
 * POST /api/documents/:documentId/roles/auto-create
 */
router.post(
    '/documents/:documentId/roles/auto-create',
    requireAuth,
    rolesController.autoCreateRoles
);

// =============================================
// ASIGNACIÓN DE CAMPOS Y DESTINATARIOS
// =============================================

/**
 * Asignar campos a roles
 * POST /api/documents/:documentId/fields/assign-roles
 */
router.post(
    '/documents/:documentId/fields/assign-roles',
    requireAuth,
    rolesController.assignFieldsToRoles
);

/**
 * Asignar destinatarios a roles
 * POST /api/documents/:documentId/recipients/assign-roles
 */
router.post(
    '/documents/:documentId/recipients/assign-roles',
    requireAuth,
    rolesController.assignRecipientsToRoles
);

// =============================================
// VALIDACIÓN Y FIRMA (Sin autenticación - usa token)
// =============================================

/**
 * Validar acceso de firma por token
 * GET /api/signatures/validate/:token
 */
router.get(
    '/signatures/validate/:token',
    rolesController.validateSigningAccess
);

/**
 * Completar firma
 * POST /api/signatures/complete/:token
 */
router.post(
    '/signatures/complete/:token',
    rolesController.completeSignature
);

module.exports = router;
