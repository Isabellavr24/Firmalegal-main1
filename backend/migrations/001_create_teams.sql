-- ==========================================
-- MIGRACIÓN: Crear tablas de equipos (Teams)
-- Ejecutar en MySQL 8.0
-- ==========================================

-- Tabla de equipos
CREATE TABLE IF NOT EXISTS teams (
    team_id INT AUTO_INCREMENT PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    team_description TEXT,
    team_color VARCHAR(7) DEFAULT '#7c3aed',
    owner_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de miembros del equipo
CREATE TABLE IF NOT EXISTS team_members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'member') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_team_user (team_id, user_id),
    FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar columna team_id a folders para carpetas de equipo
ALTER TABLE folders ADD COLUMN team_id INT DEFAULT NULL AFTER user_id;
ALTER TABLE folders ADD FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE SET NULL;

-- Agregar columna team_id a documents para documentos compartidos con equipo
ALTER TABLE documents ADD COLUMN team_id INT DEFAULT NULL AFTER owner_id;
ALTER TABLE documents ADD FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE SET NULL;
