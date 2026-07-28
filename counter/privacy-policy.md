# Privacy Policy for Attendance Tracker

**Last Updated:** July 21, 2025

## Overview

Attendance Tracker is a Chrome browser extension that analyzes attendance data locally on the user's device. This privacy policy explains how the extension handles data.

## Data Collection

**We do not collect any user data.** This extension does not collect, record, transmit, or share any personal information, usage statistics, or attendance data with any external server, third party, or analytics service.

## Data Processing

All attendance parsing and statistical calculations are performed entirely within the user's browser on their local device. No data is sent over the network at any point during the extension's operation.

## Data Storage

The extension uses Chrome's local storage API to save two user preferences:

- **Office Start Time** — the user's configured check-in time
- **Monthly Grace Minutes** — the user's configured grace period allowance

These settings are stored exclusively on the user's device using Chrome's built-in `chrome.storage.sync` API. They are never transmitted externally.

## Third-Party Services

This extension does not interact with, send data to, or receive data from any third-party services, APIs, servers, or analytics platforms.

## Remote Code

This extension does not use remote code. All JavaScript files are bundled locally within the extension package. No external scripts, libraries, or resources are loaded.

## Changes to This Policy

Any updates to this privacy policy will be reflected in the Chrome Web Store listing and the extension's source repository.

## Contact

For questions or concerns about this privacy policy, please contact the developer through the Chrome Web Store support page or open an issue on the extension's GitHub repository.
