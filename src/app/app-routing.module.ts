import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InicioRouteComponent } from './routing/inicio-route.component';

// La navegacion principal se controla desde el panel administrativo.
const routes: Routes = [
  { path: '', component: InicioRouteComponent, pathMatch: 'full' },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
