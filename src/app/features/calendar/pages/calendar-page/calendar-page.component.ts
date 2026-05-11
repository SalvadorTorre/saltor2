import { Component } from '@angular/core';
import { NotificationsService } from '../../../../core/services/notifications/notifications.service';

@Component({
  selector: 'app-calendar-page',
  templateUrl: './calendar-page.component.html',
  styleUrls: ['./calendar-page.component.scss']
})
export class CalendarPageComponent {
  constructor(
    private readonly notificationsService: NotificationsService
  ) {}

  showWelcomeMessage(): void {
    this.notificationsService.success(
      'Bootstrap, SweetAlert2, Alertify y FullCalendar ya estan integrados.',
      'Proyecto configurado'
    );
  }
}
