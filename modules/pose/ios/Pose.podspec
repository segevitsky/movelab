Pod::Spec.new do |s|
  s.name           = 'Pose'
  s.version        = '0.0.1'
  s.summary        = 'MoveLab pose module: video file -> MediaPipe Pose 33 landmarks (+ Apple Vision fallback)'
  s.description    = 'Decodes a video with AVFoundation, runs MediaPipe Tasks PoseLandmarker (heavy) in VIDEO mode and returns plain JSON.'
  s.author         = 'MoveLab'
  s.homepage       = 'https://example.com/movelab'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision', '~> 0.10.21'

  s.source_files = '**/*.{h,m,swift}'
  # The model ships in the app bundle (see Models/). Keep assets/models/ as the canonical copy.
  s.resources = ['Models/*.task']

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
