// ============================================================================
// Plantilla de credenciales locales — Gateway ESP32 MineSafe
// Copia este archivo como "secrets.h" en esta misma carpeta (o include/secrets.h en PlatformIO).
// IMPORTANTE: "secrets.h" está bloqueado en .gitignore (NUNCA subir a Git).
// ============================================================================
#pragma once

// --- Red Wi-Fi local ---
#define WIFI_SSID                "TU_RED_WIFI"
#define WIFI_PASSWORD            "TU_CLAVE_WIFI"

// --- Firebase Realtime Database ---
#define FIREBASE_HOST            "https://TU-PROYECTO-default-rtdb.firebaseio.com"

// --- Autenticación Segura Recomendada (Firebase Auth Email/Password para Gateway IoT) ---
// 1. Crea una cuenta dedicada en Firebase Authentication (ej. gateway-devkit-v1@iot.minesafe.local)
// 2. Registra su UID en /usuarios/{uid} con:
//    { tipoUsuario: "dispositivo_iot", deviceId: "gateway_ESP32_DEVKIT_V1", isGateway: true, organizationId: "<ORG_ID>", isActive: true }
#define FIREBASE_API_KEY         "TU_FIREBASE_WEB_API_KEY"
#define FIREBASE_DEVICE_EMAIL    "gateway-devkit-v1@iot.minesafe.local"
#define FIREBASE_DEVICE_PASSWORD "CAMBIAR_CLAVE_UNICA_FUERTE_DEL_GATEWAY"

// --- MODO TRANSICIÓN LEGACY (DEPRECADO — deshabilitar tras migrar a Auth) ---
// #define FIREBASE_USE_LEGACY_TOKEN
// #define FIREBASE_AUTH         "REEMPLAZAR_Y_REVOCAR_TOKEN_LEGACY"
