# Procedimientos (runbooks)

Qué hacer, paso a paso y con las órdenes exactas, en las situaciones que no son el día a día. Cada procedimiento dice qué se ha probado y qué no.

| Procedimiento | Cuándo |
|---|---|
| [Verificación en dos pasos de Google](google-2-step-verification.md) | Antes de entrar en Atlas con tu cuenta de Google, y para revisarla (ADR-0027) |
| [Claves de las fuentes de precios](price-api-keys.md) | Para sacar y guardar las claves de EODHD y Alpha Vantage (ADR-0031) |
| [Prueba real de los precios de cierre](013-daily-close-prices-live-test.md) | Una vez, con tus claves, para dar por verificada la feature 013 |
| [Revocar todos los tokens de consola sin Google](revoke-all-tokens.md) | Sospechas que alguien tiene un token de consola tuyo (ADR-0033, punto 8; feature 015) |
| [Recuperar una cuenta de Google robada](stolen-google-account.md) | Alguien ha entrado en la cuenta de Google con la que entras en Atlas, o lo sospechas: seis pasos, en orden (ADR-0033; feature 015) |
| [Restaurar el libro de la nube](restore-the-ledger.md) | El libro de la nube está mal y quieres volver a una copia buena; también la prueba anual y la pérdida de la cuenta de AWS (ADR-0032; feature 015) |
| [Qué hacer con cada correo de Atlas](scheduled-warnings.md) | Llega un correo de Atlas: qué dice cada aviso y qué hacer; también cómo comprobar un volcado mensual contra su registro (feature 016) |
| [El histórico del BCE en la nube](ecb-history-in-the-cloud.md) | El histórico del BCE de la nube dice algo que no es verdad: restaurar una generación buena o retirar la que miente (ADR-0029; feature 016) |
| [La correspondencia de símbolos y los presupuestos de la nube](cloud-symbols-and-budgets.md) | Cambias la correspondencia de símbolos en la consola, llega el aviso de correspondencias sin contrastar, o quieres cambiar las llamadas diarias de la nube (ADR-0031; feature 016) |
| [El destinatario de los correos y los importes](mail-recipient-and-amounts.md) | Quieres que los correos lleven los euros, o dejen de llevarlos, o que lleguen a otra dirección (ADR-0028, ADR-0034; feature 016) |
