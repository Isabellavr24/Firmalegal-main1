/**
 * =============================================
 * SELECTOR DE ROLES PARA CAMPOS
 * Sistema para asignar roles a campos al estilo DocuSeal
 * =============================================
 */

class RolesFieldSelector {
    constructor() {
        this.roles = [];
        this.currentRoleId = null;
        this.fields = [];
        this.documentId = null;

        // ✅ Detectar modo pagaré desde URL
        const urlParams = new URLSearchParams(window.location.search);
        this.documentType = urlParams.get('documentType') || urlParams.get('type') || 'normal';
        this.isPagareMode = this.documentType === 'pagare';

        console.log(`📋 RolesFieldSelector - Modo: ${this.isPagareMode ? 'PAGARÉ' : 'NORMAL'}`);

        // Colores predefinidos para roles
        this.roleColors = [
            '#3B82F6', // Blue
            '#10B981', // Green
            '#F59E0B', // Amber
            '#EF4444', // Red
            '#8B5CF6', // Purple
            '#EC4899', // Pink
            '#14B8A6', // Teal
            '#F97316', // Orange
        ];

        // ✅ Nombres de roles según el tipo de documento
        if (this.isPagareMode) {
            this.roleNames = [
                'Viewer 1',
                'Viewer 2',
                'Viewer 3',
                'Viewer 4',
                'Viewer 5',
                'Viewer 6',
                'Viewer 7',
                'Viewer 8'
            ];
        } else {
            this.roleNames = [
                'Primera Parte',
                'Segunda Parte',
                'Tercera Parte',
                'Cuarta Parte',
                'Quinta Parte',
                'Sexta Parte',
                'Séptima Parte',
                'Octava Parte'
            ];
        }
    }

    /**
     * Inicializar el selector de roles
     */
    async init(documentId) {
        this.documentId = documentId;

        // Cargar roles existentes o crear uno por defecto
        await this.loadOrCreateRoles();

        // Renderizar selector de roles
        this.renderRoleSelector();

        // Configurar event listeners
        this.setupEventListeners();

        console.log('✅ Selector de roles inicializado');
    }

    /**
     * Cargar roles existentes o crear roles por defecto
     */
    async loadOrCreateRoles() {
        try {
            // Intentar cargar roles existentes
            const user = JSON.parse(localStorage.getItem('currentUser'));
            const response = await fetch(`/api/documents/${this.documentId}/roles?user_id=${user.user_id}`);

            if (response.ok) {
                const data = await response.json();
                if (data.roles && data.roles.length > 0) {
                    this.roles = data.roles;
                    this.currentRoleId = this.roles[0].roleId;
                    return;
                }
            }

            // ⚠️ ELIMINADO: NO crear rol por defecto automáticamente
            // Los campos pueden quedar SIN asignar a ninguna parte (part_id = NULL)
            // El usuario debe agregar partes manualmente con "+ Agregar Parte"
            console.log('ℹ️ Sin roles configurados. Los campos quedarán sin parte asignada.');
            this.roles = [];
            this.currentRoleId = null;

        } catch (error) {
            console.log('ℹ️ Sin roles configurados. Los campos quedarán sin parte asignada.');
            this.roles = [];
            this.currentRoleId = null;
        }
    }

    /**
     * Crear un rol por defecto (Primera Parte)
     * ⚠️ DEPRECADO: Ya no se llama automáticamente, solo si el usuario hace click en "+ Agregar Parte"
     */
    createDefaultRole() {
        this.roles = [{
            roleId: 'temp_1', // ID temporal
            name: 'Primera Parte',
            order: 1,
            color: this.roleColors[0],
            isTemp: true
        }];
        this.currentRoleId = 'temp_1';
    }

    /**
     * Renderizar selector de roles en el panel derecho
     */
    renderRoleSelector() {
        // Buscar el panel derecho
        const rightPanel = document.querySelector('aside.panel:last-child');

        if (!rightPanel) {
            console.error('No se encontró el panel derecho');
            return;
        }

        // Crear contenedor de roles si no existe
        let rolesContainer = document.getElementById('rolesSelector');

        if (!rolesContainer) {
            rolesContainer = document.createElement('div');
            rolesContainer.id = 'rolesSelector';
            rolesContainer.style.cssText = `
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid #E5E7EB;
            `;

            // Insertar antes de las herramientas
            const firstTool = rightPanel.querySelector('.tool');
            if (firstTool) {
                rightPanel.insertBefore(rolesContainer, firstTool.parentElement);
            } else {
                rightPanel.insertBefore(rolesContainer, rightPanel.firstChild);
            }
        }

        // HTML del selector
        rolesContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <label style="font-size: 13px; font-weight: 600; color: #374151;">
                    Asignar a:
                </label>
                <button id="addRoleBtn" class="chip" style="padding: 4px 10px; font-size: 11px; background: #F3F4F6;">
                    + Agregar Parte
                </button>
            </div>

            <div id="rolesList" style="display: flex; flex-direction: column; gap: 8px;">
                ${this.roles.length === 0 ? this.renderUnassignedOption() : this.roles.map(role => this.renderRoleOption(role)).join('')}
            </div>
        `;

        // Actualizar título del panel según rol seleccionado
        this.updatePanelTitle();
    }

    /**
     * Renderizar opción "Sin asignar" cuando no hay roles
     */
    renderUnassignedOption() {
        return `
            <div
                class="role-option"
                data-role-id="null"
                style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 12px;
                    border: 2px solid #9CA3AF;
                    border-radius: 8px;
                    background: #F3F4F6;
                    cursor: default;
                "
            >
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <div style="
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: #9CA3AF;
                        border: 2px solid white;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    "></div>
                    <span style="font-size: 13px; font-weight: 500; color: #6B7280;">
                        Sin asignar
                    </span>
                </div>
                <div style="font-size: 11px; color: #9CA3AF;">
                    Haz click en "+ Agregar Parte"
                </div>
            </div>
        `;
    }

    /**
     * Renderizar una opción de rol
     */
    renderRoleOption(role) {
        const isSelected = role.roleId === this.currentRoleId;

        return `
            <div
                class="role-option"
                data-role-id="${role.roleId}"
                style="
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 12px;
                    border: 2px solid ${isSelected ? role.color : '#E5E7EB'};
                    border-radius: 8px;
                    background: ${isSelected ? role.color + '10' : 'white'};
                    cursor: pointer;
                    transition: all 0.2s;
                "
            >
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <div style="
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        background: ${role.color};
                        border: 2px solid white;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    "></div>
                    <span style="
                        font-size: 13px;
                        font-weight: ${isSelected ? '600' : '500'};
                        color: ${isSelected ? role.color : '#374151'};
                    ">
                        ${role.name}
                    </span>
                </div>
                ${isSelected ? `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="${role.color}">
                        <circle cx="8" cy="8" r="8"/>
                        <path d="M6 8l2 2 4-4" stroke="white" stroke-width="2" fill="none"/>
                    </svg>
                ` : ''}
            </div>
        `;
    }

    /**
     * Actualizar título del panel según rol seleccionado
     */
    updatePanelTitle() {
        const rightPanel = document.querySelector('aside.panel:last-child');
        const title = rightPanel.querySelector('h4');

        if (title) {
            const currentRole = this.roles.find(r => r.roleId === this.currentRoleId);
            if (currentRole) {
                title.textContent = currentRole.name;
                title.style.color = currentRole.color;
            }
        }
    }

    /**
     * Configurar event listeners
     */
    setupEventListeners() {
        // Click en opciones de rol
        document.addEventListener('click', (e) => {
            const roleOption = e.target.closest('.role-option');
            if (roleOption) {
                const roleId = roleOption.dataset.roleId;
                this.selectRole(roleId);
            }
        });

        // Botón de agregar nueva parte
        const addRoleBtn = document.getElementById('addRoleBtn');
        if (addRoleBtn) {
            addRoleBtn.addEventListener('click', () => {
                this.addNewRole();
            });
        }

        // Interceptar creación de campos para asignar rol automáticamente
        this.interceptFieldCreation();
    }

    /**
     * Seleccionar un rol
     */
    selectRole(roleId) {
        this.currentRoleId = roleId;
        this.renderRoleSelector();

        // Actualizar campos existentes visualmente
        this.updateFieldsVisuals();

        const currentRole = this.getCurrentRole();
        console.log(`✅ Rol seleccionado: ${currentRole ? currentRole.name : 'Sin asignar'}`);
    }

    /**
     * Obtener rol actual
     * Retorna null si no hay roles o ninguno está seleccionado
     */
    getCurrentRole() {
        if (this.roles.length === 0 || this.currentRoleId === null) {
            return null;
        }
        return this.roles.find(r => r.roleId === this.currentRoleId);
    }

    /**
     * Agregar nuevo rol/parte
     */
    addNewRole() {
        const nextIndex = this.roles.length;

        if (nextIndex >= this.roleNames.length) {
            alert('Máximo 8 partes permitidas');
            return;
        }

        const newRole = {
            roleId: `temp_${Date.now()}`,
            name: this.roleNames[nextIndex],
            order: nextIndex + 1,
            color: this.roleColors[nextIndex % this.roleColors.length],
            isTemp: true
        };

        this.roles.push(newRole);
        this.currentRoleId = newRole.roleId;

        this.renderRoleSelector();

        console.log(`✅ Nueva parte agregada: ${newRole.name}`);
        
        // 🔥 NUEVO: Guardar partes automáticamente cuando se agrega una nueva
        this.autoSaveParts();
    }

    /**
     * Interceptar creación de campos para asignar rol
     */
    interceptFieldCreation() {
        // Hook en la función original de creación de campos
        const originalAddField = window.addField;

        if (originalAddField) {
            window.addField = (fieldData) => {
                // Agregar roleId al campo (puede ser null si no hay parte seleccionada)
                const currentRole = this.getCurrentRole();
                fieldData.roleId = this.currentRoleId;
                fieldData.roleColor = currentRole ? currentRole.color : null;
                fieldData.roleName = currentRole ? currentRole.name : null;

                // Llamar función original
                const field = originalAddField.call(window, fieldData);

                // Aplicar estilo del rol al campo (solo si hay rol)
                if (field && currentRole) {
                    this.applyRoleStyleToField(field, currentRole);
                }

                // Guardar en lista de campos
                this.fields.push({
                    ...fieldData,
                    element: field
                });

                console.log(`📌 Campo asignado a: ${fieldData.roleName || 'Sin asignar'}`);

                // 🔥 NUEVO: Guardar partes automáticamente cuando se asigna el primer campo
                // Solo si hay roles configurados
                if (this.roles.length > 0) {
                    this.autoSaveParts();
                }

                return field;
            };
        }
    }

    /**
     * Aplicar estilo del rol a un campo
     */
    applyRoleStyleToField(fieldElement, role) {
        if (!fieldElement) return;

        // Si no hay rol, no aplicar ningún estilo especial
        if (!role) {
            console.log('⚠️ Campo sin rol asignado, no se aplica estilo');
            return;
        }

        // 🔥 MEJORADO: Aplicar borde de color más visible
        fieldElement.style.borderColor = role.color;
        fieldElement.style.borderWidth = '3px';
        fieldElement.style.borderStyle = 'solid';

        // 🔥 NUEVO: Actualizar el label del campo con el nombre de la parte
        const label = fieldElement.querySelector('.label');
        if (label) {
            const currentText = label.textContent;
            const baseText = currentText.split(':')[0]; // "Firma", "Texto", etc.
            label.textContent = `${baseText}: ${role.name}`;
            label.style.color = role.color;
            label.style.fontWeight = '600';
        }

        // Agregar dropdown para cambiar rol
        this.addRoleDropdownToField(fieldElement, role);
    }

    /**
     * Agregar dropdown de rol a un campo
     */
    addRoleDropdownToField(fieldElement, currentRole) {
        // Botón de menú
        let menuBtn = fieldElement.querySelector('.field-role-menu-btn');

        if (!menuBtn) {
            menuBtn = document.createElement('button');
            menuBtn.className = 'field-role-menu-btn';
            menuBtn.innerHTML = '⋮';
            menuBtn.style.cssText = `
                position: absolute;
                top: 2px;
                right: 2px;
                width: 20px;
                height: 20px;
                background: white;
                border: 1px solid ${currentRole.color};
                border-radius: 4px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                display: none;
                z-index: 11;
            `;
            fieldElement.appendChild(menuBtn);
        }

        // Mostrar botón al hover
        fieldElement.addEventListener('mouseenter', () => {
            menuBtn.style.display = 'block';
        });

        fieldElement.addEventListener('mouseleave', () => {
            menuBtn.style.display = 'none';
        });

        // Click en botón de menú
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showRoleDropdown(fieldElement, menuBtn);
        });
    }

    /**
     * Mostrar dropdown de selección de rol
     */
    showRoleDropdown(fieldElement, menuBtn) {
        // Remover dropdowns anteriores
        document.querySelectorAll('.role-dropdown').forEach(d => d.remove());

        // Crear dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'role-dropdown';
        dropdown.style.cssText = `
            position: absolute;
            top: 25px;
            right: 0;
            background: white;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            min-width: 180px;
            z-index: 1000;
            overflow: hidden;
        `;

        // Opciones de roles
        const options = this.roles.map(role => `
            <div
                class="role-dropdown-option"
                data-role-id="${role.roleId}"
                style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                "
                onmouseover="this.style.background='#F3F4F6'"
                onmouseout="this.style.background='white'"
            >
                <div style="
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: ${role.color};
                "></div>
                <span style="font-size: 13px; font-weight: 500;">
                    ${role.name}
                </span>
            </div>
        `).join('');

        dropdown.innerHTML = `
            <div style="
                padding: 8px 12px;
                border-bottom: 1px solid #E5E7EB;
                font-size: 11px;
                font-weight: 600;
                color: #6B7280;
                text-transform: uppercase;
            ">
                Cambiar asignación
            </div>
            ${options}
            <div
                class="role-dropdown-delete"
                style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    cursor: pointer;
                    border-top: 1px solid #E5E7EB;
                    color: #EF4444;
                    font-size: 13px;
                    font-weight: 500;
                "
                onmouseover="this.style.background='#FEE2E2'"
                onmouseout="this.style.background='white'"
            >
                <span>🗑️</span>
                <span>Eliminar campo</span>
            </div>
        `;

        menuBtn.appendChild(dropdown);

        // Event listeners para opciones
        dropdown.querySelectorAll('.role-dropdown-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const roleId = option.dataset.roleId;
                this.changeFieldRole(fieldElement, roleId);
                dropdown.remove();
            });
        });

        // Eliminar campo
        dropdown.querySelector('.role-dropdown-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('¿Eliminar este campo?')) {
                fieldElement.remove();
                // Remover de lista de campos
                this.fields = this.fields.filter(f => f.element !== fieldElement);
            }
            dropdown.remove();
        });

        // Cerrar al hacer click fuera
        setTimeout(() => {
            document.addEventListener('click', function closeDropdown() {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            });
        }, 10);
    }

    /**
     * Cambiar rol de un campo
     */
    changeFieldRole(fieldElement, newRoleId) {
        const newRole = this.roles.find(r => r.roleId === newRoleId);

        if (!newRole) return;

        // Actualizar estilo
        this.applyRoleStyleToField(fieldElement, newRole);

        // Actualizar en lista de campos
        const fieldIndex = this.fields.findIndex(f => f.element === fieldElement);
        if (fieldIndex >= 0) {
            this.fields[fieldIndex].roleId = newRoleId;
            this.fields[fieldIndex].roleColor = newRole.color;
            this.fields[fieldIndex].roleName = newRole.name;
        }

        console.log(`✅ Campo reasignado a: ${newRole.name}`);
    }

    /**
     * Actualizar visuales de todos los campos
     */
    updateFieldsVisuals() {
        this.fields.forEach(field => {
            const role = this.roles.find(r => r.roleId === field.roleId);
            if (role && field.element) {
                this.applyRoleStyleToField(field.element, role);
            }
        });
    }

    /**
     * Guardar roles en el backend
     */
    async saveRoles() {
        try {
            const user = JSON.parse(localStorage.getItem('currentUser'));

            // Preparar datos de roles
            const rolesData = this.roles.map((role, index) => ({
                name: role.name,
                order: index + 1,
                color: role.color,
                signInOrder: true
            }));

            // Enviar al backend
            const response = await fetch(`/api/documents/${this.documentId}/roles?user_id=${user.user_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roles: rolesData,
                    signInOrder: false, // Por defecto paralelo
                    reminderIntervalDays: 3,
                    expirationDays: 30
                })
            });

            const data = await response.json();

            if (data.success) {
                // Actualizar IDs temporales con IDs reales
                data.roles.forEach((savedRole, index) => {
                    if (this.roles[index].isTemp) {
                        const oldId = this.roles[index].roleId;
                        this.roles[index].roleId = savedRole.roleId;
                        this.roles[index].isTemp = false;

                        // Actualizar campos con el nuevo ID
                        this.fields.forEach(field => {
                            if (field.roleId === oldId) {
                                field.roleId = savedRole.roleId;
                            }
                        });
                    }
                });

                console.log('✅ Roles guardados exitosamente');
                return true;
            } else {
                throw new Error(data.error);
            }

        } catch (error) {
            console.error('❌ Error al guardar roles:', error);
            return false;
        }
    }

    /**
     * 🔥 NUEVO: Guardar partes automáticamente en la tabla document_parts
     */
    async autoSaveParts() {
        if (!this.documentId) {
            console.warn('⚠️ No hay documentId para guardar partes');
            return false;
        }

        // Solo guardar si hay más de una parte o si se asignaron campos
        if (this.roles.length === 1 && this.fields.length === 0) {
            console.log('ℹ️ Solo hay una parte sin campos asignados, no se guarda aún');
            return false;
        }

        try {
            const user = JSON.parse(localStorage.getItem('currentUser'));

            // Detectar y loggear el uso de partes
            if (this.roles.length > 1) {
                console.log(`\n📌 ========================================`);
                console.log(`📌 SISTEMA DE PARTES DETECTADO`);
                console.log(`📌 ========================================`);
                console.log(`📌 Documento: ${this.documentId}`);
                console.log(`📌 Total de partes: ${this.roles.length}`);
                console.log(`📌 ----------------------------------------`);
                
                this.roles.forEach((role, index) => {
                    const fieldsCount = this.fields.filter(f => f.roleId === role.roleId).length;
                    console.log(`📌 ${role.name}:`);
                    console.log(`   - Orden: ${role.order}`);
                    console.log(`   - Campos asignados: ${fieldsCount}`);
                    console.log(`   - Color: ${role.color}`);
                });
                
                console.log(`📌 ========================================\n`);
            }

            const response = await fetch(`/api/documents/${this.documentId}/parts`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token || ''}`
                },
                body: JSON.stringify({
                    parts: this.roles.map((role, index) => ({
                        name: role.name,
                        order: index + 1,
                        color: role.color
                    }))
                })
            });

            const data = await response.json();

            if (data.ok) {
                console.log('✅ Partes guardadas automáticamente en BD');

                // ✅ CORREGIDO: Guardar partId por separado, NO sobrescribir roleId
                // roleId debe seguir siendo order_position (1, 2, 3...) para el mapeo
                if (data.parts && data.parts.length > 0) {
                    data.parts.forEach((part, index) => {
                        if (this.roles[index]) {
                            // Guardar part_id real por separado
                            this.roles[index].partId = part.partId;
                            // roleId debe seguir siendo order_position
                            this.roles[index].roleId = part.order || (index + 1);
                            this.roles[index].isTemp = false;
                        }
                    });
                }

                return true;
            } else {
                console.warn('⚠️ No se pudieron guardar las partes:', data.error);
                return false;
            }

        } catch (error) {
            console.error('❌ Error al guardar partes:', error);
            return false;
        }
    }

    /**
     * Obtener campos agrupados por rol
     */
    getFieldsByRole() {
        const fieldsByRole = {};

        this.roles.forEach(role => {
            fieldsByRole[role.roleId] = this.fields.filter(f => f.roleId === role.roleId);
        });

        return fieldsByRole;
    }

    /**
     * Obtener resumen para mostrar al usuario
     */
    getSummary() {
        const summary = this.roles.map(role => {
            const fieldsCount = this.fields.filter(f => f.roleId === role.roleId).length;
            return {
                name: role.name,
                color: role.color,
                fieldsCount
            };
        });

        return summary;
    }
}

// Instancia global
window.rolesFieldSelector = null;

// Inicializar cuando el documento esté listo
window.initRolesSelector = function(documentId) {
    if (!window.rolesFieldSelector) {
        window.rolesFieldSelector = new RolesFieldSelector();
    }
    window.rolesFieldSelector.init(documentId);
};

// Guardar roles antes de guardar campos
window.saveRolesBeforeFields = async function() {
    if (window.rolesFieldSelector) {
        return await window.rolesFieldSelector.saveRoles();
    }
    return true;
};

console.log('✅ Módulo de Selector de Roles cargado');
