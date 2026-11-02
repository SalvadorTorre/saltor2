import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { registerLocaleData } from '@angular/common';
import localeEsDO from '@angular/common/locales/es-DO';

import { AppModule } from './app/app.module';

// Formato dominicano (RD$, separadores) que usan los montos de la confirmación de pago, entre otros.
registerLocaleData(localeEsDO, 'es-DO');


platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
