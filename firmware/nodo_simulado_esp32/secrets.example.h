// ============================================================================
// Plantilla de credenciales locales — Nodo Simulado ESP32 MineSafe (device_9F4C2A7E1B08)
// Copia este archivo como "secrets.h" en esta misma carpeta (o include/secrets.h en PlatformIO).
// IMPORTANTE: "secrets.h" está bloqueado en .gitignore (NUNCA subir a Git).
// Nota: Si MODO_SOLO_ESPNOW = true, estas credenciales no se utilizan en runtime,
// pero se mantienen separadas para modo híbrido (MODO_SOLO_ESPNOW = false).
// ============================================================================
#pragma once

// --- Red Wi-Fi local (solo usada si MODO_SOLO_ESPNOW = false) ---
#define WIFI_SSID                "TU_RED_WIFI"
#define WIFI_PASSWORD            "TU_CLAVE_WIFI"

// --- Firebase Realtime Database ---
#define FIREBASE_HOST            "https://TU-PROYECTO-default-rtdb.firebaseio.com"

// --- Autenticación Segura Recomendada (Firebase Auth Email/Password para Dispositivo IoT) ---
// Registrar UID en /usuarios/{uid} con:
// { tipoUsuario: "dispositivo_iot", deviceId: "device_9F4C2A7E1B08", organizationId: "<ORG_ID>", isActive: true }
#define FIREBASE_API_KEY         "TU_FIREBASE_WEB_API_KEY"
#define FIREBASE_DEVICE_EMAIL    "nodo-9f4c2a7e1b08@iot.minesafe.local"
#define FIREBASE_DEVICE_PASSWORD "CAMBIAR_CLAVE_UNICA_FUERTE_DEL_NODO_SIMULADO"

// --- MODO TRANSICIÓN LEGACY (DEPRECADO — deshabilitar tras migrar a Auth) ---
// #define FIREBASE_USE_LEGACY_TOKEN
// #define FIREBASE_AUTH         "REEMPLAZAR_Y_REVOCAR_TOKEN_LEGACY"
