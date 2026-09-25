import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

@Component({
  selector: 'app-cash-opening-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-opening-page.component.html',
  styleUrls: ['./cash-opening-page.component.scss']
})
export class CashOpeningPageComponent {
  readonly viewMode = 'cash_opening';

  constructor(public data: AppDataService) {}
}
