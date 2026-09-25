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
      this.errorMessage = 'No fue posible verificar las cuentas registradas. Revise la conexión con Supabase.';
    }
  }

  async login(): Promise<void> {
    this.errorMessage = '';
    this.isLoading = true;
    try {
      this.loggedIn.emit(await this.auth.signIn(this.email, this.password));
    } catch (error) {
      this.errorMessage = this.messageFrom(error, 'Correo o clave incorrectos.');
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
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
