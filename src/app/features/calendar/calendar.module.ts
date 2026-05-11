import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FullCalendarModule } from '@fullcalendar/angular';

import { CalendarRoutingModule } from './calendar-routing.module';
import { CalendarPageComponent } from './pages/calendar-page/calendar-page.component';

@NgModule({
  declarations: [CalendarPageComponent],
  imports: [
    CommonModule,
    FullCalendarModule,
    CalendarRoutingModule
  ]
})
export class CalendarModule {}
