import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Injectable } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Service } from '../../services/data';

@Injectable({
  providedIn: 'root'
})

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,    
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatToolbarModule,
    RouterModule
  ],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})

export class Admin {

  constructor(private service: Service, private router: Router) {}

  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  

}


