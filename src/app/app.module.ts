import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginPageComponent } from './login/login-page.component';
import { PriceLookupComponent } from './shared/price-lookup/price-lookup.component';

// Las pantallas no se importan aquí: cada una se carga desde su ruta
// (app-routing.module.ts) para que el paquete inicial solo traiga el login y
// el marco de la aplicación.
@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
    LoginPageComponent,
    PriceLookupComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
