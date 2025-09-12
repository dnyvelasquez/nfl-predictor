import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-reglamento',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule
  ],
  templateUrl: './reglamento.html',
  styleUrls: ['./reglamento.css']
})
export class Reglamento {}
