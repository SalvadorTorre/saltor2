import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-page.component.html',
  styleUrls: ['./report-page.component.scss']
})
export class ReportPageComponent {
  readonly viewMode = 'report';

  constructor(public data: AppDataService) {}
}
