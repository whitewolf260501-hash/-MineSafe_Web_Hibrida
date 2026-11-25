// ============================================================================
// Plantilla de credenciales locales — Nodo Físico ESP32 MineSafe
// Copia este archivo como "secrets.h" en esta misma carpeta y completa tus datos.
// IMPORTANTE: "secrets.h" está bloqueado en .gitignore (NUNCA subir a Git).
// ============================================================================
#pragma once

// --- Red Wi-Fi local ---
#define WIFI_SSID               "TU_RED_WIFI"
#define WIFI_PASSWORD           "TU_CLAVE_WIFI"

// --- Firebase Realtime Database ---
#define FIREBASE_HOST           "https://TU-PROYECTO-default-rtdb.firebaseio.com"

// --- Autenticación Segura Recomendada (Firebase Auth Email/Password para Dispositivo IoT) ---
// 1. Crea una cuenta dedicada en Firebase Authentication (ej. nodo-38a839e81f84@iot.minesafe.local)
// 2. Registra su UID en /usuarios/{uid} con:
//    { tipoUsuario: "dispositivo_iot", deviceId: "device_38A839E81F84", organizationId: "<ORG_ID>", isActive: true }
// 3. Usa la Web API Key pública del proyecto (solo identifica el proyecto; la seguridad la aplica Auth + RTDB Rules).
#define FIREBASE_API_KEY        "TU_FIREBASE_WEB_API_KEY"
#define FIREBASE_DEVICE_EMAIL   "nodo-38a839e81f84@iot.minesafe.local"
#define FIREBASE_DEVICE_PASSWORD "CAMBIAR_CLAVE_UNICA_FUERTE_DEL_DISPOSITIVO"

// --- MODO TRANSICIÓN LEGACY (DEPRECADO — deshabilitar tras migrar a Auth) ---
// Solo descomentar temporalmente mientras se completa la transición desde Database Secret.
// #define FIREBASE_USE_LEGACY_TOKEN
// #define FIREBASE_AUTH        "REEMPLAZAR_Y_REVOCAR_TOKEN_LEGACY"
