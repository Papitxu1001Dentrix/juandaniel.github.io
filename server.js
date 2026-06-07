const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

// 1. CARGA DE ENTORNO (Salto a la raíz)
// Forzamos la ruta absoluta al .env que está un nivel arriba de /AmigosWebAmigas/
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const router = express.Router();
router.use(cors());
router.use(express.json());

/* ==========================================================
   CONFIGURACIÓN (Carga desde ../config/auditoria.json)
========================================================== */
let configAuditoria = { google: {}, azure: {} };

try {
    const configPath = path.resolve(__dirname, "..", "config", "auditoria.json");
    
    if (fs.existsSync(configPath)) {
        configAuditoria = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        console.log("✅ [Auditoría] Archivo de configuración asimilado.");
    } else {
        console.warn("⚠️ [Auditoría] No se encontró config/auditoria.json en la raíz.");
    }
} catch (err) {
    console.error("❌ [Auditoría] Error leyendo el archivo JSON:", err.message);
}

/* ==========================================================
   AZURE TEXT ANALYSIS (IA Sentimental)
========================================================== */
router.post("/api/azure/analyze", async (req, res) => {
    // Verificar si Azure está activo en el JSON
    if (!configAuditoria.azure || !configAuditoria.azure.sentiment_active) {
        return res.status(403).json({ error: "Azure está desactivado en la configuración." });
    }

    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No se recibió texto para analizar." });

    try {
        // Extraer credenciales (priorizando .env)
        const endpoint = process.env.AZURE_LANGUAGE_ENDPOINT || configAuditoria.azure.endpoint;
        const key = process.env.AZURE_LANGUAGE_KEY;

        // VALIDACIÓN CRÍTICA: Si no hay llave o endpoint, devolvemos error claro
        if (!endpoint || !key) {
            console.error("❌ ERROR: Azure Key o Endpoint no detectados. Revisa el .env");
            return res.status(500).json({ 
                error: "Configuración de servidor incompleta", 
                debug: { hasKey: !!key, hasEndpoint: !!endpoint } 
            });
        }

        // Limpiamos el endpoint de barras finales
        const baseEndpoint = endpoint.replace(/\/$/, "");

        const response = await axios.post(
            `${baseEndpoint}/language/:analyze-text?api-version=2022-05-01`,
            {
                analysisInput: {
                    documents: [{ id: "1", language: "es", text: text }]
                },
                kind: "SentimentAnalysis"
            },
            {
                headers: {
                    "Ocp-Apim-Subscription-Key": key,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json(response.data);

    } catch (error) {
        // Enviamos el detalle exacto del error de Azure para diagnosticar
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : error.message;
        
        console.error("❌ Error en Azure API:", data);
        res.status(status).json({ error: "Error en Azure AI", details: data });
    }
});

/* ==========================================================
   GOOGLE PAGESPEED API
========================================================== */
router.post("/api/google/pagespeed", async (req, res) => {
    if (!configAuditoria.google || !configAuditoria.google.pagespeed_active) {
        return res.status(403).json({ error: "Google PageSpeed desactivado." });
    }

    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL requerida." });

    try {
        const response = await axios.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            {
                params: {
                    url: url,
                    key: process.env.GOOGLE_API_KEY
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Error en PageSpeed", details: error.message });
    }
});

module.exports = router;