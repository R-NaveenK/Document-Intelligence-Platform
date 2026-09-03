# Teammate Module Integration Guide

This guide explains how external processing modules developed independently by teammates (Extraction, Structuring, and Validation) seamlessly integrate into the main platform by replacing the mock services.

## Overview

The platform uses a microservice architecture where the Express API Gateway communicates with external processing modules solely via HTTP REST APIs and JSON contracts. 

The mock services in `teammate-services/` serve as active development targets. To replace a mock service with a production implementation, **no code changes in the Express backend gateway are required**.

---

## Service Contracts & Replacement Steps

### 1. Preprocessing + Extraction Teammate

- **Mock Location**: `teammate-services/extraction-mock/`
- **Config Variable**: `EXTRACTION_SERVICE_URL` in `.env` (default: `http://localhost:5001`)

**Replacement Requirements:**
1. Expose a `GET /health` endpoint returning `{ "status": "UP" }`.
2. Expose a `POST /api/v1/extract` endpoint.
3. Accept payload: `{ "jobId": string, "fileId": string }`.
4. Return output strictly matching [extraction.contract.json](file:///d:/Document-intelligence-platform/shared/contracts/extraction.contract.json).
5. Update `EXTRACTION_SERVICE_URL` in `.env` or `docker-compose.yml` to point to your service host.

---

### 2. Structuring Layer Teammate

- **Mock Location**: `teammate-services/structuring-mock/`
- **Config Variable**: `STRUCTURING_SERVICE_URL` in `.env` (default: `http://localhost:5002`)

**Replacement Requirements:**
1. Expose a `GET /health` endpoint returning `{ "status": "UP" }`.
2. Expose a `POST /api/v1/structure` endpoint.
3. Accept input strictly matching `StructuringInput` in [structuring.contract.json](file:///d:/Document-intelligence-platform/shared/contracts/structuring.contract.json).
4. Return extracted fields matching `StructuringOutput`.
5. Update `STRUCTURING_SERVICE_URL` in `.env` or `docker-compose.yml` to point to your service host.

---

### 3. Validation Engine Teammate

- **Mock Location**: `teammate-services/validation-mock/`
- **Config Variable**: `VALIDATION_SERVICE_URL` in `.env` (default: `http://localhost:5003`)

**Replacement Requirements:**
1. Expose a `GET /health` endpoint returning `{ "status": "UP" }`.
2. Expose a `POST /api/v1/validate` endpoint.
3. Accept structuring fields input.
4. Return validation results strictly matching [validation.contract.json](file:///d:/Document-intelligence-platform/shared/contracts/validation.contract.json).
5. Update `VALIDATION_SERVICE_URL` in `.env` or `docker-compose.yml` to point to your service host.

---

## Validation & Verification

Run the integration test suite to verify that your service replacement satisfies contract validation:

```bash
npm run test:integration
```
