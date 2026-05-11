import { Injectable } from '@angular/core';

import { CalendarEventModel } from './calendar.model';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  getEvents(): CalendarEventModel[] {
    return [
      {
        id: 'evt-001',
        title: 'Kickoff del proyecto',
        start: '2026-04-07T09:00:00',
        end: '2026-04-07T10:00:00',
        color: '#0f4c81',
        description: 'Reunion inicial de planificacion.'
      },
      {
        id: 'evt-002',
        title: 'Revision funcional',
        start: '2026-04-08T14:00:00',
        end: '2026-04-08T15:30:00',
        color: '#198754',
        description: 'Espacio para validar avances del modulo.'
      },
      {
        id: 'evt-003',
        title: 'Entrega de sprint',
        start: '2026-04-10',
        allDay: true,
        color: '#dc3545',
        description: 'Fecha prevista de entrega.'
      }
    ];
  }
}
