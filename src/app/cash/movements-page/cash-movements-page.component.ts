import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

@Component({
  selector: 'app-cash-movements-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-movements-page.component.html',
  styleUrls: ['./cash-movements-page.component.scss']
})
export class CashMovementsPageComponent {
  readonly viewMode = 'cash_movements';

  constructor(public data: AppDataService) {}
}
