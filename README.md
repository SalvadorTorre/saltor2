# Saltor2

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 16.2.14.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

## Despliegue automático en Hostinger

Cada cambio enviado a la rama `main` se compila y publica automáticamente en `public_html/erpsaltorsystem/` mediante GitHub Actions.

En el repositorio de GitHub, abre **Settings > Secrets and variables > Actions** y crea estos secretos:

- `HOSTINGER_FTP_SERVER`: `212.85.29.176`
- `HOSTINGER_FTP_USERNAME`: `u911344530`
- `HOSTINGER_FTP_PASSWORD`: la contraseña FTP de Hostinger

Después de guardar los secretos, sube los cambios a `main`. También puedes iniciar el flujo manualmente desde la pestaña **Actions**, en el flujo **Publicar en Hostinger**.
