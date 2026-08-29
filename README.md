# Atlas Portfolio Tracker

Aplicación para gestionar una cartera personal de inversión.

## Estado

Proyecto en fase inicial. Todavía no hay código de aplicación.

## Flujo de trabajo (git flow)

El repositorio sigue el modelo **git flow**:

| Rama        | Propósito                                                        |
|-------------|------------------------------------------------------------------|
| `main`      | Código en producción. Cada release se etiqueta (`vX.Y.Z`).       |
| `develop`   | Rama de integración. De aquí parten las *features*.              |
| `feature/*` | Desarrollo de una funcionalidad. Se fusiona en `develop`.        |
| `release/*` | Preparación de una versión. Se fusiona en `main` y `develop`.    |
| `hotfix/*`  | Arreglos urgentes sobre `main`. Se fusionan en `main` y `develop`.|

Se usa **git básico, sin la extensión `git-flow`**. Comandos habituales:

```bash
# Feature
git checkout -b feature/<nombre> develop
git checkout develop && git merge --no-ff feature/<nombre> && git branch -d feature/<nombre>

# Release
git checkout -b release/<version> develop
git checkout main && git merge --no-ff release/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff release/<version> && git branch -d release/<version>

# Hotfix
git checkout -b hotfix/<version> main
git checkout main && git merge --no-ff hotfix/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff hotfix/<version> && git branch -d hotfix/<version>
```

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`, …), en inglés y en una sola línea.
