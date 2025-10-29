import { Component } from '@angular/core';
import { Service, Juego } from '../../services/data';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin, Observable, of } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-juegos',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    AsyncPipe,
    CommonModule
],
  templateUrl: './juegos.html',
  styleUrls: ['./juegos.css']
})

export class Juegos  {
  juegos$!: Observable<Juego[]>;
  currentWeekId: number | null = null;
  minWeek: number | null = null;
  maxWeek: number | null = null;

  constructor(private service: Service) {
    forkJoin({
      sem: this.service.getSemanaActualId(),
      lim: this.service.getExtremosSemanas()
    }).subscribe(({ sem, lim }) => {
      this.currentWeekId = sem ?? lim.min ?? null;
      this.minWeek = lim.min;
      this.maxWeek = lim.max;

      if (this.currentWeekId != null) {
        this.juegos$ = this.service.getJuegosPorSemanaId(this.currentWeekId);
      } else {
        this.juegos$ = of([]);
      }
    });
  }

  private loadWeek(id: number | null) {
    if (id == null) return;
    this.currentWeekId = id;
    this.juegos$ = this.service.getJuegosPorSemanaId(id);
  }

  prevWeek() {
    if (this.currentWeekId == null) return;
    this.service.getSemanaAnteriorId(this.currentWeekId).subscribe(id => this.loadWeek(id));
  }

  nextWeek() {
    if (this.currentWeekId == null) return;
    this.service.getSemanaSiguienteId(this.currentWeekId).subscribe(id => this.loadWeek(id));
  }
}

