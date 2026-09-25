import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

@Component({
  selector: 'app-cash-closing-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cash-closing-page.component.html',
  styleUrls: ['./cash-closing-page.component.scss']
})
export class CashClosingPageComponent {
  readonly viewMode = 'cash_closing';

  constructor(public data: AppDataService) {}
}
