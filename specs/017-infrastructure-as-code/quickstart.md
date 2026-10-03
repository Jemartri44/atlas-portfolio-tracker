# Guía de verificación sin AWS

Prerrequisitos: `terraform` en el `PATH`, `npm ci`, ningún `AWS_*` en el entorno (el guardián falla si lo hay). Todo lo que sigue existirá al implementar; esta guía fija lo que se ejecutará.

```bash
# 1. Sintaxis y esquema, por raíz (una a la vez, tras `free -m` > 1500 MB)
terraform fmt -check -recursive infra/
for r in bootstrap/account bootstrap/env envs/dev envs/prod; do
  terraform -chdir=infra/$r init -backend=false && terraform -chdir=infra/$r validate
done
# 2. Proveedor simulado, una raíz cada vez
terraform -chdir=infra/envs/dev test
# 3. Análisis estático del plan renderizado y ensayos de guiones
npx vitest run --project infra --pool=forks --maxWorkers=1
```

Resultado esperado: todo en verde, sin tráfico a AWS (los `endpoints` del proveedor apuntan a un puerto cerrado) y ninguna cadena personal en la salida. Ver `plan.md`, «Cómo se verifica sin AWS».
