import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActiveUserSession, AuthService, InitialAdminForm, LoginCompany } from '../core/services/auth/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss']
})
export class LoginPageComponent implements OnInit {
  @Output() readonly loggedIn = new EventEmitter<ActiveUserSession>();

  email = '';
  password = '';
  isLoading = false;
  errorMessage = '';
  confirmationMessage = '';
  showInitialSetup = false;
  companies: LoginCompany[] = [];
  initialAdmin: InitialAdminForm = {
    firstName: '', lastName: '', username: '', email: '', password: '', companyId: null, branch: ''
  };

  constructor(private readonly auth: AuthService) {}

  async ngOnInit(): Promise<void> {
    try {
      this.showInitialSetup = !(await this.auth.hasRegisteredUsers());
      if (this.showInitialSetup) {
        this.companies = await this.auth.getCompanies();
      }
    } catch {
      this.errorMessage = 'No se puede leer la cuenta. En Supabase habilite el esquema myappdb en Settings > API > Exposed schemas.';
    }
  }

  async login(): Promise<void> {
    this.errorMessage = '';
    this.confirmationMessage = '';
    this.isLoading = true;
    try {
      this.loggedIn.emit(await this.auth.signIn(this.email, this.password));
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'Correo o clave incorrectos.');
    } finally {
      this.isLoading = false;
    }
  }

  async resendConfirmation(): Promise<void> {
    this.errorMessage = '';
    this.confirmationMessage = '';
    this.isLoading = true;
    try {
      await this.auth.resendConfirmation(this.email);
      this.confirmationMessage = 'Enviamos un correo de confirmación. Revise su bandeja de entrada y correo no deseado.';
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'No fue posible reenviar el correo de confirmación.');
    } finally {
      this.isLoading = false;
    }
  }

  async createInitialAdmin(): Promise<void> {
    if (!this.initialAdmin.firstName.trim() || !this.initialAdmin.lastName.trim() ||
        !this.initialAdmin.username.trim() || !this.initialAdmin.email.trim() || this.initialAdmin.password.length < 6) {
      this.errorMessage = 'Complete los datos requeridos. La clave debe tener al menos 6 caracteres.';
      return;
    }

    this.errorMessage = '';
    this.isLoading = true;
    try {
      this.loggedIn.emit(await this.auth.registerInitialAdmin(this.initialAdmin));
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'No fue posible crear el administrador inicial.');
    } finally {
      this.isLoading = false;
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    const message = error instanceof Error && error.message ? error.message : fallback;
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'Tu correo aún no está confirmado. Usa el botón “Reenviar correo de confirmación” y abre el enlace más reciente.';
    }
    return message;
  }
}
