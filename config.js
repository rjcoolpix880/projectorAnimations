// Projector wall layout. See README.md for every option.
window.CONFIG = {
  "stage": {
    "width": 800,
    "height": 1280,
    "fit": "contain",
    "background": "#000"
  },
  "mediaFolder": "https://rjaia.com/content/",
  "reloadMinutes": 0,
  "zones": [
    {
      "id": "top-left-1",
      "x": 3,
      "y": 21,
      "w": 376,
      "h": 223,
      "fit": "contain",
      "duration": 35,
      "fade": 1,
      "items": [
        { "src": "brooks/brooks-animation.gif" },
        { "src": "WTCC Panel_A.gif" },
        { "src": "FWH Wood Wall Animation.gif" },
        { "src": "Cyberworx-Stair-New.gif" }
      ]
    },
    {
      "id": "top-left-2",
      "x": 3,
      "y": 242,
      "w": 376,
      "h": 218,
      "fit": "contain",
      "duration": 30,
      "fade": 1,
      "items": [
        { "src": "WTCC/wtcc-reflect.gif" },
        { "src": "nml-stair-spin.gif" },
        { "src": "cyber/cyber_surface.gif" },
        { "src": "Skylight Animation.gif" },
        { "src": "Cyber-Stair1.gif" }
      ]
    },
    {
      "id": "upper-left",
      "x": 4,
      "y": 462,
      "w": 374,
      "h": 225,
      "fit": "contain",
      "duration": 33,
      "fade": 1,
      "items": [
        { "src": "fwh-stair-process.gif" },
        { "src": "nml-wt4-animation.gif" },
        { "src": "WTCC Panel_B.gif" },
        { "src": "FINAL-animation_full-quality.gif" },
        { "src": "cyber/Cyber_Panels_Slower.gif" }
      ]
    },
    {
      "id": "upper-right-black",
      "x": 400,
      "y": 0,
      "w": 347,
      "h": 685,
      "type": "black"
    },
    {
      "id": "bottom-half",
      "x": 2,
      "y": 687,
      "w": 797,
      "h": 593,
      "src": "https://rjaia.com/yankee/"
    }
  ]
};
