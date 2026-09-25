import { NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { DashboardPageComponent } from './dashboard/dashboard-page/dashboard-page.component';
import { CompanyPageComponent } from './company/company-page/company-page.component';
import { UsersPageComponent } from './users/users-page/users-page.component';
import { NcfPageComponent } from './ncf/ncf-page/ncf-page.component';
import { NcfTypePageComponent } from './ncf/ncf-type-page/ncf-type-page.component';
import { RncPageComponent } from './rnc/rnc-page/rnc-page.component';
import { SettingsOtherPageComponent } from './settings/other-page/other-page.component';
import { ProductsPageComponent } from './products/products-page/products-page.component';
import { ClientsPageComponent } from './clients/clients-page/clients-page.component';
import { SuppliersPageComponent } from './suppliers/suppliers-page/suppliers-page.component';
import { InvoiceNewPageComponent } from './invoices/new-page/new-page.component';
import { InvoiceHistoryPageComponent } from './invoices/history-page/history-page.component';
import { InvoiceConsultationPageComponent } from './invoices/consultation-page/consultation-page.component';
import { QuotationPageComponent } from './quotations/quotation-page/quotation-page.component';
import { CashOpeningPageComponent } from './cash/opening-page/cash-opening-page.component';
import { CashClosingPageComponent } from './cash/closing-page/cash-closing-page.component';
import { CashMovementsPageComponent } from './cash/movements-page/cash-movements-page.component';
import { AccountingPageComponent } from './accounting/accounting-page/accounting-page.component';
import { ReportPageComponent } from './reports/report-page/report-page.component';
import { LoginPageComponent } from './login/login-page.component';

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
    DashboardPageComponent,
    CompanyPageComponent,
    UsersPageComponent,
    NcfPageComponent,
    NcfTypePageComponent,
    RncPageComponent,
    SettingsOtherPageComponent,
    ProductsPageComponent,
    ClientsPageComponent,
    SuppliersPageComponent,
    InvoiceNewPageComponent,
    InvoiceHistoryPageComponent,
    InvoiceConsultationPageComponent,
    QuotationPageComponent,
    CashOpeningPageComponent,
    CashClosingPageComponent,
    CashMovementsPageComponent,
    AccountingPageComponent,
    ReportPageComponent,
    LoginPageComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
