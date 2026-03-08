import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="legal-page">
      <h1>Terms of Service</h1>
      <p class="effective">Effective Date: March 2026</p>

      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using Ladders ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
      </section>

      <section>
        <h2>2. Description of Service</h2>
        <p>Ladders is a competitive ranking platform that allows users to join leagues, find opponents through skill-based matchmaking, play matches in person, and track rankings via an ELO rating system.</p>
      </section>

      <section>
        <h2>3. User Accounts</h2>
        <p>You must create an account to use most features. You are responsible for maintaining the confidentiality of your account and for all activities under it. You agree to provide accurate information and to keep it updated.</p>
      </section>

      <section>
        <h2>4. User Conduct</h2>
        <p>You agree to:</p>
        <ul>
          <li>Report match results honestly and accurately</li>
          <li>Treat other users with respect in all communications</li>
          <li>Not manipulate rankings through fake matches or collusion</li>
          <li>Not use the Service for any unlawful purpose</li>
          <li>Not attempt to interfere with the proper functioning of the Service</li>
        </ul>
      </section>

      <section>
        <h2>5. Content and Data</h2>
        <p>You retain ownership of any content you submit. By using the Service, you grant us a license to use, display, and distribute your content as needed to operate the Service (e.g., displaying your name on leaderboards).</p>
      </section>

      <section>
        <h2>6. Termination</h2>
        <p>We may suspend or terminate your account if you violate these Terms. You may delete your account at any time by contacting us.</p>
      </section>

      <section>
        <h2>7. Disclaimers</h2>
        <p>The Service is provided "as is" without warranties of any kind. We do not guarantee continuous, uninterrupted access. Ladders facilitates in-person meetups between players; we are not responsible for interactions that occur outside the platform.</p>
      </section>

      <section>
        <h2>8. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Ladders and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
      </section>

      <section>
        <h2>9. Changes to Terms</h2>
        <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>For questions about these Terms, please reach out via the <a routerLink="/help">Help</a> page.</p>
      </section>
    </div>
  `,
  styleUrl: './legal.component.scss'
})
export class TermsComponent {}
