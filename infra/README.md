# LifeDash Infrastructure (Bicep)

Provisions everything LifeDash needs on Azure:

| Resource | Name (prod) | Purpose |
| --- | --- | --- |
| Container Registry | `lifedashprodacr` | Stores backend & frontend images |
| Log Analytics | `lifedash-prod-logs` | Container Apps logs |
| Container Apps Env | `lifedash-prod-env` | Shared runtime environment |
| PostgreSQL Flexible Server | `lifedash-prod-pg` | Database (B1ms burstable, 32 GB) |
| Container App | `lifedash-prod-api` | FastAPI backend |
| Container App | `lifedash-prod-web` | Angular app served by nginx (proxies `/api`) |

## First deployment

```bash
az deployment group create \
  --resource-group lifeos-rg \
  --template-file infra/main.bicep \
  --parameters postgresAdminPassword='<strong-password>' \
               jwtSecretKey='<long-random-string-at-least-32-chars>'
```

The container apps start with a public hello-world image; the CI/CD pipeline
replaces them with real images on the first deploy (Phase 2). After the first
CI push, pass `backendImage`/`frontendImage` explicitly or let the pipeline
update the apps with `az containerapp update`.

## Notes

- Scale-to-zero (`minReplicas: 0`) keeps costs near zero on Azure for Students.
- The Postgres firewall currently allows all Azure services; switch to VNet
  integration before real multi-user production traffic.
- Database migrations run automatically on backend container start
  (`alembic upgrade head`).
