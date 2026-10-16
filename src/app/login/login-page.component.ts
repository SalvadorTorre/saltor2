import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActiveUserSession, AuthService } from '../core/services/auth/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent {
  @Output() readonly loggedIn = new EventEmitter<ActiveUserSession>();

  userId = '';
  password = '';
  isLoading = false;
  errorMessage = '';

  constructor(private readonly auth: AuthService) {}

  async login(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      this.loggedIn.emit(await this.auth.signIn(this.userId, this.password));
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'ID de usuario o clave incorrectos.');
    } finally {
      this.isLoading = false;
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    const message = error instanceof Error && error.message ? error.message : fallback;
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'Tu cuenta aún no está confirmada. Solicita al administrador que confirme o active el acceso.';
    }
    return message;
  }
}
