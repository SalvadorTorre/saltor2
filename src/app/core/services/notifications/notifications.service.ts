import { Injectable } from '@angular/core';
import alertify from 'alertifyjs';
import Swal from 'sweetalert2';

import { NotificationConfirmOptions } from './notifications.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  success(message: string, title = 'Operacion completada'): void {
    void Swal.fire({
      icon: 'success',
      title,
      text: message,
      confirmButtonColor: '#0f4c81'
    });
  }

  error(message: string, title = 'Ha ocurrido un error'): void {
    alertify.error(`${title}: ${message}`);
  }

  confirm(options: NotificationConfirmOptions): Promise<boolean> {
    return Swal.fire({
      icon: 'question',
      title: options.title,
      text: options.text,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText ?? 'Aceptar',
      cancelButtonText: options.cancelButtonText ?? 'Cancelar',
      confirmButtonColor: '#0f4c81'
    }).then((result) => result.isConfirmed);
  }
}
